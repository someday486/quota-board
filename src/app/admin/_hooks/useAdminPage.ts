'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  type ApplicationRealtimeRow,
  type RealtimeConnectionState,
  type RealtimePayload,
  type RegionTotalRealtimeRow,
} from '@/lib/realtimeEgress';

type UseAdminPageParams = {
  setAdminUserId: (id: string) => void;
  setAdminName: (name: string) => void;
  setChecking: (value: boolean) => void;
  loadRegions: () => Promise<void>;
  loadStatus: () => Promise<void>;
  loadApplies: () => Promise<void>;
  loadApplyLimit: () => Promise<void>;
  loadLeaders: () => Promise<void>;
  loadExemptUserIds: () => Promise<void>;
  loadTodayCounts: () => Promise<void>;
  loadActiveGroup: () => Promise<void>;
  setApplyLimit: (value: number) => void;
  setApplyLimitInput: (value: string) => void;
  setExemptUserIds: (value: string[]) => void;
  setActiveGroup: (value: number) => void;
  exemptKey: string;
  groupSettingKey: string;
  onRegionTotalChange?: (payload: RealtimePayload<RegionTotalRealtimeRow>) => void;
  onApplicationChange?: (payload: RealtimePayload<ApplicationRealtimeRow>) => void;
  setRealtimeState?: (value: RealtimeConnectionState) => void;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  role?: string | null;
  is_admin?: boolean | null;
  leader_group?: number | null;
};

const REALTIME_RETRY_MAX_MS = 30_000;
const REALTIME_CATCH_UP_DELAY_MS = 3_000;
const REALTIME_STABLE_RESET_MS = 30_000;
const REALTIME_VISIBILITY_SYNC_STALE_MS = 5 * 60 * 1000;
const REALTIME_HEALTH_CHECK_MS = 60 * 1000;

export function useAdminPage({
  setAdminUserId,
  setAdminName,
  setChecking,
  loadRegions,
  loadStatus,
  loadApplies,
  loadApplyLimit,
  loadLeaders,
  loadExemptUserIds,
  loadTodayCounts,
  loadActiveGroup,
  setApplyLimit,
  setApplyLimitInput,
  setExemptUserIds,
  setActiveGroup,
  exemptKey,
  groupSettingKey,
  onRegionTotalChange,
  onApplicationChange,
  setRealtimeState,
}: UseAdminPageParams) {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    let ch: ReturnType<typeof supabase.channel> | null = null;

    let retryTimer: number | null = null;
    let catchUpTimer: number | null = null;
    let stableTimer: number | null = null;
    let healthTimer: number | null = null;
    let onVis: (() => void) | null = null;
    let liveRefreshTimer: number | null = null;
    let needsRegions = false;
    let needsStatus = false;
    let needsApplies = false;
    let needsTodayCounts = false;
    let reconnectAttempt = 0;
    let channelGeneration = 0;
    let realtimeConnected = false;
    let hasConnectedOnce = false;
    let lastSyncAt = 0;
    let syncInFlight: Promise<void> | null = null;

    const flushLiveRefresh = () => {
      liveRefreshTimer = null;
      const runRegions = needsRegions;
      const runStatus = needsStatus;
      const runApplies = needsApplies;
      const runTodayCounts = needsTodayCounts;
      needsRegions = false;
      needsStatus = false;
      needsApplies = false;
      needsTodayCounts = false;

      if (!alive) return;
      if (document.visibilityState !== 'visible') {
        needsRegions = runRegions;
        needsStatus = runStatus;
        needsApplies = runApplies;
        needsTodayCounts = runTodayCounts;
        return;
      }
      if (runRegions) loadRegions();
      if (runStatus) loadStatus();
      if (runApplies) loadApplies();
      if (runTodayCounts) loadTodayCounts();
    };

    const scheduleLiveRefresh = (options: {
      regions?: boolean;
      status?: boolean;
      applies?: boolean;
      todayCounts?: boolean;
      delayMs?: number;
    }) => {
      needsRegions = needsRegions || Boolean(options.regions);
      needsStatus = needsStatus || Boolean(options.status);
      needsApplies = needsApplies || Boolean(options.applies);
      needsTodayCounts = needsTodayCounts || Boolean(options.todayCounts);

      if (liveRefreshTimer) window.clearTimeout(liveRefreshTimer);
      liveRefreshTimer = window.setTimeout(flushLiveRefresh, options.delayMs ?? 300);
    };

    const boot = async () => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (userErr || !userRes?.user) {
        router.replace('/login');
        return;
      }

      const uid = userRes.user.id;
      setAdminUserId(uid);

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('user_id, display_name, role, is_admin, leader_group')
        .eq('user_id', uid)
        .maybeSingle();

      if (!alive) return;

      if (profErr || !prof) {
        router.replace('/login');
        return;
      }

      const p = prof as ProfileRow;
      const isAdmin = p.role === 'admin' || Boolean(p.is_admin);

      if (!isAdmin) {
        router.replace('/login');
        return;
      }

      setAdminName(p.display_name ?? '관리자');

      await Promise.all([
        loadRegions(),
        loadStatus(),
        loadApplies(),
      ]);
      lastSyncAt = Date.now();

      if (!alive) return;

      setChecking(false);

      // Backfill less-critical admin controls after the first screen is visible.
      void Promise.allSettled([
        loadApplyLimit(),
        loadLeaders(),
        loadExemptUserIds(),
        loadTodayCounts(),
        loadActiveGroup(),
      ]);

      if (!alive) return;

      const catchUpAfterReconnect = () => {
        if (!alive) return Promise.resolve();
        if (syncInFlight) return syncInFlight;

        syncInFlight = Promise.allSettled([
          loadRegions(),
          loadStatus(),
          loadApplies(),
          loadTodayCounts(),
          loadApplyLimit(),
          loadExemptUserIds(),
          loadActiveGroup(),
        ])
          .then(() => {
            lastSyncAt = Date.now();
          })
          .finally(() => {
            syncInFlight = null;
          });

        return syncInFlight;
      };

      const scheduleReconnect = (status: 'CLOSED' | 'TIMED_OUT' | 'CHANNEL_ERROR') => {
        if (!alive || retryTimer !== null) return;

        realtimeConnected = false;
        if (catchUpTimer !== null) {
          window.clearTimeout(catchUpTimer);
          catchUpTimer = null;
        }
        if (stableTimer !== null) {
          window.clearTimeout(stableTimer);
          stableTimer = null;
        }
        setRealtimeState?.(status === 'CLOSED' ? 'disconnected' : 'reconnecting');
        const baseDelayMs = Math.min(
          REALTIME_RETRY_MAX_MS,
          1000 * 2 ** Math.min(reconnectAttempt, 5),
        );
        const delayMs = baseDelayMs + Math.floor(Math.random() * 500);
        reconnectAttempt += 1;
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          resubscribe();
        }, delayMs);
      };

      function resubscribe() {
        if (!alive) return;

        if (retryTimer !== null) {
          window.clearTimeout(retryTimer);
          retryTimer = null;
        }

        const previousChannel = ch;
        const generation = ++channelGeneration;
        ch = null;
        if (previousChannel) void supabase.removeChannel(previousChannel);
        setRealtimeState?.(hasConnectedOnce ? 'reconnecting' : 'connecting');

        const channel = supabase
          .channel(`admin-live-${Date.now()}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'region_totals' }, (payload) => {
            if (onRegionTotalChange) {
              onRegionTotalChange(payload as RealtimePayload<RegionTotalRealtimeRow>);
            } else {
              scheduleLiveRefresh({ status: true });
            }
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'applications_live' }, (payload) => {
            if (onApplicationChange) {
              onApplicationChange(payload as RealtimePayload<ApplicationRealtimeRow>);
            } else {
              scheduleLiveRefresh({ applies: true, status: true, todayCounts: true });
            }
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'regions' }, () => {
            scheduleLiveRefresh({ regions: true, status: true });
          })
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'app_settings', filter: 'key=eq.apply_limit_per_user_per_day' },
            (payload) => {
              const row = (payload.new ?? payload.old) as { value_int?: number } | null;
              const v = Number(row?.value_int ?? 0);
              const safe = Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0;
              setApplyLimit(safe);
              setApplyLimitInput(String(safe));
            },
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'app_settings', filter: `key=eq.${exemptKey}` },
            (payload) => {
              const row = (payload.new ?? payload.old) as { value_json?: unknown } | null;
              const raw = row?.value_json;
              const arr = Array.isArray(raw) ? raw : [];
              setExemptUserIds(arr.map(String));
            },
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'app_settings', filter: `key=eq.${groupSettingKey}` },
            (payload) => {
              const row = (payload.new ?? payload.old) as { value_int?: number } | null;
              const v = Number(row?.value_int ?? 0);
              const safe = Number.isFinite(v) ? Math.max(0, Math.min(2, Math.trunc(v))) : 0;
              setActiveGroup(safe);
            },
          )
          .subscribe((status) => {
            if (!alive || generation !== channelGeneration || ch !== channel) return;

            if (status === 'SUBSCRIBED') {
              const shouldCatchUp = hasConnectedOnce || reconnectAttempt > 0;
              realtimeConnected = true;
              hasConnectedOnce = true;
              setRealtimeState?.('connected');
              if (shouldCatchUp) {
                catchUpTimer = window.setTimeout(() => {
                  catchUpTimer = null;
                  if (alive && realtimeConnected && generation === channelGeneration && ch === channel) {
                    void catchUpAfterReconnect();
                  }
                }, REALTIME_CATCH_UP_DELAY_MS);
              }
              stableTimer = window.setTimeout(() => {
                stableTimer = null;
                if (alive && realtimeConnected && generation === channelGeneration && ch === channel) {
                  reconnectAttempt = 0;
                }
              }, REALTIME_STABLE_RESET_MS);
              return;
            }
            if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
              scheduleReconnect(status);
            }
          });

        ch = channel;
      }

      resubscribe();

      onVis = () => {
        if (document.visibilityState === 'visible') {
          if (!realtimeConnected) {
            resubscribe();
          } else if (Date.now() - lastSyncAt >= REALTIME_VISIBILITY_SYNC_STALE_MS) {
            void catchUpAfterReconnect();
          }
        }
      };
      document.addEventListener('visibilitychange', onVis);

      healthTimer = window.setInterval(() => {
        if (!alive) return;
        if (document.visibilityState !== 'visible') return;
        if (!realtimeConnected && retryTimer === null) resubscribe();
      }, REALTIME_HEALTH_CHECK_MS);

    };

    boot();

    return () => {
      alive = false;
      channelGeneration += 1;
      if (ch) void supabase.removeChannel(ch);
      ch = null;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (catchUpTimer) window.clearTimeout(catchUpTimer);
      if (stableTimer) window.clearTimeout(stableTimer);
      if (healthTimer) window.clearInterval(healthTimer);
      if (liveRefreshTimer) window.clearTimeout(liveRefreshTimer);
      if (onVis) document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
