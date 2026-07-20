'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { WikiCategory, WikiCategoryId, WikiPage } from '@/content/wiki';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';

type WikiPayload = {
  accessScope: 'full' | 'leader';
  categories: WikiCategory[];
  pages: WikiPage[];
  error?: string;
};

const ALL_CATEGORIES = 'all';
const DEFAULT_BASIS_DATE = '2026-07-07';
const EMPTY_CATEGORIES: WikiCategory[] = [];
const EMPTY_PAGES: WikiPage[] = [];

function categoryImageSrc(categoryId: WikiCategoryId) {
  return `/wiki/${categoryId}.svg`;
}

function formatBasisDate(date: string) {
  return date.replaceAll('-', '.');
}

function pageSearchText(page: WikiPage) {
  const blockText = page.blocks
    .map((block) =>
      [
        block.heading,
        ...(block.paragraphs ?? []),
        ...(block.bullets ?? []),
        ...(block.steps ?? []),
        ...(block.scriptLines ?? []),
        ...(block.table?.headers ?? []),
        ...(block.table?.rows.flat() ?? []),
        block.note ?? '',
      ].join(' ')
    )
    .join(' ');

  const externalLinkText = page.externalLinks
    ?.map((link) => [link.label, link.description ?? '', link.url].join(' '))
    .join(' ');

  const responseGuideText = page.responseGuide
    ?.map((guide) => [guide.objection, guide.response, guide.nextStep ?? ''].join(' '))
    .join(' ');

  const newsArticleText = page.newsArticles
    ?.map((article) => [article.title, article.publisher, article.date ?? '', article.description ?? '', article.url].join(' '))
    .join(' ');

  return [
    page.title,
    page.summary,
    page.audience,
    page.tags.join(' '),
    page.sourceFiles.join(' '),
    page.basisDate ?? '',
    responseGuideText ?? '',
    newsArticleText ?? '',
    externalLinkText ?? '',
    blockText,
  ]
    .join(' ')
    .toLowerCase();
}

export default function WikiClient() {
  const router = useRouter();
  const [wikiData, setWikiData] = useState<WikiPayload | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<WikiCategoryId | typeof ALL_CATEGORIES>(ALL_CATEGORIES);
  const [activePageId, setActivePageId] = useState('');
  const deferredQuery = useDeferredValue(query);

  const categories = wikiData?.categories ?? EMPTY_CATEGORIES;
  const pages = wikiData?.pages ?? EMPTY_PAGES;

  useEffect(() => {
    let alive = true;

    const loadWiki = async () => {
      setLoadError('');
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        router.replace('/login');
        return;
      }

      const res = await fetch('/api/wiki', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as WikiPayload | null;

      if (!alive) return;

      if (res.status === 401 || res.status === 403) {
        router.replace('/login');
        return;
      }

      if (!res.ok || !json) {
        setLoadError(json?.error || '업무 위키를 불러오지 못했습니다.');
        return;
      }

      const nextPages = Array.isArray(json.pages) ? json.pages : [];
      const nextCategories = Array.isArray(json.categories) ? json.categories : [];
      setWikiData({
        accessScope: json.accessScope === 'full' ? 'full' : 'leader',
        categories: nextCategories,
        pages: nextPages,
      });
      setCategoryFilter((current) => {
        if (current === ALL_CATEGORIES) return current;
        return nextCategories.some((category) => category.id === current) ? current : ALL_CATEGORIES;
      });
      setActivePageId((current) => {
        if (current && nextPages.some((page) => page.id === current)) return current;
        return nextPages[0]?.id ?? '';
      });
    };

    void loadWiki();

    return () => {
      alive = false;
    };
  }, [router]);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const searchIndex = useMemo(() => pages.map((page) => ({ page, text: pageSearchText(page) })), [pages]);

  const filteredPages = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return searchIndex
      .filter(({ page, text }) => {
        const categoryMatches = categoryFilter === ALL_CATEGORIES || page.categoryId === categoryFilter;
        const queryMatches = !normalizedQuery || text.includes(normalizedQuery);
        return categoryMatches && queryMatches;
      })
      .map(({ page }) => page);
  }, [categoryFilter, deferredQuery, searchIndex]);

  const activePage = useMemo(() => {
    return pages.find((page) => page.id === activePageId) ?? filteredPages[0] ?? pages[0];
  }, [activePageId, filteredPages, pages]);

  const activeCategory = activePage ? categoryById.get(activePage.categoryId) : null;
  const tagCount = useMemo(() => new Set(pages.flatMap((page) => page.tags)).size, [pages]);
  const relatedPages = activePage?.relatedPageIds
    ?.map((id) => pages.find((page) => page.id === id))
    .filter((page): page is WikiPage => Boolean(page));
  const externalLinks = activePage?.externalLinks ?? [];
  const responseGuide = activePage?.responseGuide ?? [];
  const newsArticles = activePage?.newsArticles ?? [];
  const basisDate = activePage?.basisDate ?? DEFAULT_BASIS_DATE;

  const handlePrint = () => {
    window.print();
  };

  if (!wikiData && !loadError) {
    return (
      <main className={styles.page} lang="ko-KR">
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.headerText}>
              <div className={styles.titleRow}>
                <h1>업무 위키</h1>
                <span className={styles.dateBadge}>권한 확인 중</span>
              </div>
              <p>로그인 권한에 맞는 업무 위키 문서를 불러오고 있습니다.</p>
            </div>
          </header>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={styles.page} lang="ko-KR">
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.headerText}>
              <div className={styles.titleRow}>
                <h1>업무 위키</h1>
                <span className={styles.dateBadge}>오류</span>
              </div>
              <p>{loadError}</p>
            </div>
            <div className={styles.headerActions}>
              <button type="button" onClick={() => router.back()} className={styles.secondaryButton}>
                이전 화면
              </button>
            </div>
          </header>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page} lang="ko-KR">
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.titleRow}>
              <h1>업무 위키</h1>
              <span className={styles.dateBadge}>전체 점검 2026.07.07</span>
            </div>
            <p>섭외센터 매뉴얼, TM 스크립트, 서비스 브로셔, 운영 규정을 한 곳에서 검색합니다.</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" onClick={() => router.back()} className={styles.secondaryButton}>
              이전 화면
            </button>
            <button type="button" onClick={() => router.push('/hr/calendar')} className={styles.secondaryButton}>
              휴가관리
            </button>
          </div>
        </header>

        <section className={styles.stats} aria-label="위키 요약">
          <div>
            <span>{pages.length}</span>
            <p>문서</p>
          </div>
          <div>
            <span>{categories.length}</span>
            <p>분류</p>
          </div>
          <div>
            <span>{tagCount}</span>
            <p>검색 태그</p>
          </div>
        </section>

        <section className={styles.searchPanel} aria-label="문서 검색">
          <label htmlFor="wiki-search">검색어</label>
          <input
            id="wiki-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: DB등록, 병특, ISO, 수수료, 퇴사자"
          />
        </section>

        <div className={styles.contentGrid}>
          <aside className={styles.sidebar} aria-label="위키 문서 목록">
            <div className={styles.filterGroup}>
              <button
                type="button"
                onClick={() => setCategoryFilter(ALL_CATEGORIES)}
                className={categoryFilter === ALL_CATEGORIES ? styles.activeFilter : styles.filterButton}
              >
                전체
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryFilter(category.id)}
                  className={categoryFilter === category.id ? styles.activeFilter : styles.filterButton}
                >
                  {category.title}
                </button>
              ))}
            </div>

            <div className={styles.resultMeta}>
              검색 결과 <b>{filteredPages.length}</b>건
            </div>

            <nav className={styles.pageList}>
              {filteredPages.length === 0 ? (
                <div className={styles.emptyState}>
                  <b>검색 결과가 없습니다.</b>
                  <span>다른 현장 용어나 상품명을 입력해보세요.</span>
                </div>
              ) : (
                filteredPages.map((page) => {
                  const category = categoryById.get(page.categoryId);
                  const selected = page.id === activePage?.id;

                  return (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => setActivePageId(page.id)}
                      className={selected ? styles.activePageButton : styles.pageButton}
                      aria-current={selected ? 'page' : undefined}
                    >
                      <Image src={categoryImageSrc(page.categoryId)} alt="" width={108} height={72} className={styles.listThumb} />
                      <span className={styles.pageButtonText}>
                        <span>{category?.title}</span>
                        <strong>{page.title}</strong>
                        <small>{page.summary}</small>
                      </span>
                    </button>
                  );
                })
              )}
            </nav>
          </aside>

          {activePage ? (
            <article className={styles.article}>
              <div className={styles.articleHeader}>
                <div className={styles.articleIntro}>
                  <div className={styles.categoryLabel}>{activeCategory?.title ?? '문서'}</div>
                  <div className={styles.articleTitleRow}>
                    <h2>{activePage.title}</h2>
                    <button type="button" onClick={handlePrint} className={styles.articlePrintButton}>
                      인쇄
                    </button>
                  </div>
                  <p>{activePage.summary}</p>
                </div>
                <div className={styles.visualPanel}>
                  <Image
                    src={categoryImageSrc(activePage.categoryId)}
                    alt={`${activeCategory?.title ?? '업무'} 이미지`}
                    width={320}
                    height={180}
                    className={styles.heroImage}
                  />
                  <div className={styles.audienceBox}>
                    <span>대상</span>
                    <b>{activePage.audience}</b>
                  </div>
                  <div className={styles.basisBox}>
                    <span>기준일</span>
                    <b>{formatBasisDate(basisDate)}</b>
                    <small>지원금·세법·인증 요건은 상담 전 재확인</small>
                  </div>
                </div>
              </div>

              <div className={styles.tagList}>
                {activePage.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>

              <div className={styles.body}>
                {activePage.blocks.map((block) => (
                  <section key={block.heading} className={styles.block}>
                    <h3>{block.heading}</h3>
                    {block.paragraphs?.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {block.steps ? (
                      <ol>
                        {block.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    ) : null}
                    {block.bullets ? (
                      <ul>
                        {block.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    ) : null}
                    {block.table ? (
                      <div className={styles.tableScroll}>
                        <table>
                          <thead>
                            <tr>
                              {block.table.headers.map((header) => (
                                <th key={header}>{header}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.table.rows.map((row) => (
                              <tr key={row.join('|')}>
                                {row.map((cell, index) => (
                                  <td key={`${cell}-${index}`}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    {block.scriptLines ? (
                      <div className={styles.scriptBox}>
                        {block.scriptLines.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    ) : null}
                    {block.note ? <div className={styles.note}>{block.note}</div> : null}
                  </section>
                ))}
              </div>

              {responseGuide.length > 0 ? (
                <section className={styles.responseGuide} aria-label="대표 반응별 대응집">
                  <div className={styles.sectionTitleRow}>
                    <span>즉시 대응</span>
                    <h3>대표 반응별 대응집</h3>
                  </div>
                  <div className={styles.responseGrid}>
                    {responseGuide.map((guide) => (
                      <article key={guide.objection} className={styles.responseCard}>
                        <strong>{guide.objection}</strong>
                        <p>{guide.response}</p>
                        {guide.nextStep ? <small>{guide.nextStep}</small> : null}
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {(relatedPages && relatedPages.length > 0) || externalLinks.length > 0 || newsArticles.length > 0 ? (
                <section className={styles.related} aria-label="관련 자료">
                  {relatedPages && relatedPages.length > 0 ? (
                    <>
                      <h3>관련 문서</h3>
                      <div className={styles.relatedList}>
                        {relatedPages.map((page) => (
                          <button key={page.id} type="button" onClick={() => setActivePageId(page.id)}>
                            {page.title}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {externalLinks.length > 0 ? (
                    <>
                      <div className={styles.referenceHeader}>
                        <span>공식</span>
                        <h3>공식 확인 링크</h3>
                      </div>
                      <div className={styles.externalLinkList}>
                        {externalLinks.map((link) => (
                          <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className={styles.externalLink}>
                            <span className={styles.referenceType}>공식 자료</span>
                            <strong>{link.label}</strong>
                            {link.description ? <span>{link.description}</span> : null}
                          </a>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {newsArticles.length > 0 ? (
                    <>
                      <div className={styles.referenceHeader}>
                        <span>기사</span>
                        <h3>도움되는 기사</h3>
                      </div>
                      <div className={styles.newsList}>
                        {newsArticles.map((article) => (
                          <a key={article.url} href={article.url} target="_blank" rel="noreferrer" className={styles.newsCard}>
                            <span className={styles.newsMeta}>
                              {article.publisher}
                              {article.date ? ` · ${formatBasisDate(article.date)}` : ''}
                            </span>
                            <strong>{article.title}</strong>
                            {article.description ? <span>{article.description}</span> : null}
                          </a>
                        ))}
                      </div>
                    </>
                  ) : null}
                </section>
              ) : null}
            </article>
          ) : null}
        </div>
      </div>
    </main>
  );
}
