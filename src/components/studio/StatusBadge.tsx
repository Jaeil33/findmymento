import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { STUDIO_STATUS_LABEL, type StudioStatus } from '@/types/studio'

/**
 * 산출물 상태 배지. **문구를 여기서만 만든다** — 화면마다 다르게 쓰면
 * "검증 실패"가 어디선 "주의"로 보이게 되고, 그게 ADR-030 이 막으려는 것이다.
 */
const TONE: Record<StudioStatus, BadgeTone> = {
  draft: 'neutral',
  failed: 'negative',
  validated: 'point',
  approved: 'positive',
}

export function StatusBadge({ status }: { status: StudioStatus }) {
  return <Badge tone={TONE[status]}>{STUDIO_STATUS_LABEL[status]}</Badge>
}
