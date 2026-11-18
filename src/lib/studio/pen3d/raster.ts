/**
 * 도안을 **그림으로** 만든다 — 이미지 2차 검토(ADR-038)의 입력이다.
 *
 * 왜 직접 그리는가: SVG 는 모델이 이미지로 읽지 못하고, 서버 PDF·래스터 라이브러리는 쓰지
 * 않는다(`docs/STUDIO.md` 금지사항). 네이티브 의존성을 하나 더 들이는 것보다, 실루엣 판정에
 * 필요한 만큼만 직접 찍는 쪽이 싸고 결정론적이다 — 같은 도안이면 **바이트까지 같다.**
 *
 * 그리는 것은 **인쇄되는 것과 같다**: 흰 바탕에 검은 윤곽선뿐이고 채우지 않는다. 채워서
 * 보여 주면 모델이 판정하는 그림과 학생이 받는 종이가 달라진다.
 *
 * 서버 전용이다 (`node:zlib`). 클라이언트 컴포넌트에서 import 하지 않는다.
 */

import { deflateSync } from 'node:zlib'
import { BEAD_WIDTH_MM } from '@/lib/studio/constants'
import { dist, segments, strokesBBox } from '@/lib/studio/geometry'
import type { Stroke } from '@/types/studio'

/** 한 변 픽셀 수. 실루엣 판정에 필요한 최소한이다 — 크게 해도 판정이 나아지지 않는다 */
export const RASTER_PX = 512

/** 1바이트 = 1픽셀 회색조. 0 이 검정, 255 가 흰색이다 */
export type Bitmap = { width: number; height: number; pixels: Uint8Array }

export function rasterize(strokes: Stroke[], options: { size?: number } = {}): Bitmap {
  const size = Math.max(64, Math.min(1024, Math.round(options.size ?? RASTER_PX)))
  const pixels = new Uint8Array(size * size).fill(255)
  const bitmap: Bitmap = { width: size, height: size, pixels }

  const drawable = strokes.filter((s) => s.points.length >= 2)
  if (drawable.length === 0) return bitmap

  const box = strokesBBox(drawable)
  const spanX = Math.max(box.max.x - box.min.x, 0.001)
  const spanY = Math.max(box.max.y - box.min.y, 0.001)
  const margin = size * 0.06
  const scale = Math.min((size - margin * 2) / spanX, (size - margin * 2) / spanY)
  const dx = (size - spanX * scale) / 2 - box.min.x * scale
  const dy = (size - spanY * scale) / 2 - box.min.y * scale

  /** 선 두께는 실제 비드 폭을 그대로 환산한 값이다. 종이에서 보이는 굵기와 같아야 한다 */
  const bead = Math.max(2, BEAD_WIDTH_MM * scale)

  const stamp = (cx: number, cy: number, radius: number) => {
    const r = Math.max(0.5, radius)
    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(size - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(size - 1, Math.ceil(cy + r))
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) pixels[y * size + x] = 0
      }
    }
  }

  for (const stroke of drawable) {
    // 접는 선은 종이에서도 가늘다. 윤곽과 같은 굵기로 찍으면 모양이 뭉친다.
    const radius = (stroke.kind === 'fold' ? bead * 0.5 : bead) / 2
    for (const seg of segments(stroke)) {
      const ax = seg.a.x * scale + dx
      const ay = seg.a.y * scale + dy
      const bx = seg.b.x * scale + dx
      const by = seg.b.y * scale + dy
      const length = dist({ x: ax, y: ay }, { x: bx, y: by })
      const steps = Math.max(1, Math.ceil(length * 2))
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps
        stamp(ax + (bx - ax) * t, ay + (by - ay) * t, radius)
      }
    }
  }

  return bitmap
}

// ============================================================================
// PNG 인코딩 — 회색조 8비트, 필터 없음
// ============================================================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

export function encodePng(bitmap: Bitmap): Buffer {
  const { width, height, pixels } = bitmap

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 비트 심도
  ihdr[9] = 0 // 회색조
  ihdr[10] = 0 // 압축 (deflate)
  ihdr[11] = 0 // 필터
  ihdr[12] = 0 // 인터레이스 없음

  // 각 줄 앞에 필터 바이트 0 을 붙인다
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0
    Buffer.from(pixels.subarray(y * width, (y + 1) * width)).copy(raw, y * (width + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 검토에 바로 넘길 수 있는 base64 PNG */
export function rasterPngBase64(strokes: Stroke[], options?: { size?: number }): string {
  return encodePng(rasterize(strokes, options)).toString('base64')
}

/** 잉크가 덮은 비율. 빈 그림(0)과 새카만 그림(1)을 걸러내는 데 쓴다 */
export function inkRatio(bitmap: Bitmap): number {
  let ink = 0
  for (const value of bitmap.pixels) if (value === 0) ink += 1
  return ink / bitmap.pixels.length
}
