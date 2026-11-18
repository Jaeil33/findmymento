/**
 * 검수된 실루엣 목록 (ADR-036). **이 파일은 생성물이다.**
 *
 * 고치는 방법은 하나다:
 *
 *   npm run studio:atlas -- --words scripts/studio/words/animals.txt
 *
 * 스크립트가 단어마다 윤곽 제안을 받아 **세 학년대 전부로 검증**하고 이미지 검토(ADR-038)까지
 * 통과한 것만 여기에 쓴다. 손으로 항목을 더하지 말 것 — 검수되지 않은 모양이 "검수됨"으로
 * 표시되는 순간 아틀라스가 가진 유일한 값이 사라진다.
 *
 * 좌표는 **0~1 정규화 비율**이다. mm 는 `lib/studio/pen3d/shape.ts` 가 만든다.
 */

import type { AtlasRecord } from '@/types/studio'

export const ATLAS_RECORDS: readonly AtlasRecord[] = []
