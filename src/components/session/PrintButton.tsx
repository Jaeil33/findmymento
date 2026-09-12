'use client'

import { Button } from '@/components/ui/Button'

/** 인쇄. 가명코드는 스티커·명찰로 잘라 배부하므로 인쇄가 실제 작업 흐름의 일부다. */
export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      인쇄하기
    </Button>
  )
}
