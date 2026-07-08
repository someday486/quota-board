'use client';

import { helpBox, xBtn } from '../styles';

type HelpBoxProps = {
  onClose: () => void;
};

export default function HelpBox({ onClose }: HelpBoxProps) {
  return (
    <div style={helpBox}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
          <b>운영 안내:</b> 총 TO를 입력하고 저장하면 즉시 반영됩니다. <b>초기화</b>는 전체 TO를 0으로 만들고
          현재 지원 내역을 모두 삭제한 뒤 1인당 하루 한도를 3으로 되돌립니다. 1인당 하루 한도는 공통 설정이며, <b>예외</b>를 켜면 해당 팀장은 한도
          적용을 받지 않습니다. 1인당 하루 한도를 0으로 설정하면 무제한입니다. 오늘 지원 조를 설정하면 해당 조만
          지원할 수 있습니다.
        </div>
        <button onClick={onClose} style={xBtn} aria-label="?リ린">
          횞
        </button>
      </div>
    </div>
  );
}
