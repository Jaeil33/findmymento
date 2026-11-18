# 코퍼스 적재 보고서

적재 시각: 2026-11-18T13:30:16.170Z

`atlas.mts` 와 달리 **LLM 을 한 번도 부르지 않는다.** 아트가 사람이 그린 것이므로
"그 단어로 보이는가" 의 답이 이미 정해져 있다 (ADR-041). 물리 검증은 그대로 받는다.

| 지표 | 값 |
|---|---|
| 시도한 단어 | 121개 |
| 들어간 것 | 86개 (71.1%) |
| 빠진 것 | 35개 |
| 목록 전체 | 93개 |
| held-out (적재 안 함) | 50개 |

## 기하 — 개편 전 LLM 윤곽과 비교

| 지표 | 코퍼스 | 개편 전 (LLM 윤곽) |
|---|---|---|
| 색 영역 개수 평균 | 6.0개 | 0개 (색이 없었다) |
| 내부선 개수 평균 | 0.9개 | 0.7개 |
| 구멍 개수 평균 | 0.1개 | 0개 |

## 단어별

| 단어 | 결과 | 영역 | 내부선 | 구멍 | 이유 |
|---|---|---|---|---|---|
| 코끼리 | 통과 | 2 | 1 | 0 | |
| 고양이 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_ANGLE_TOO_SHARP, elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_ANGLE_TOO_SHARP, elementary·solid: PEN_GAP_TOO_SMALL |
| 강아지 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_GAP_TOO_SMALL |
| 토끼 | 통과 | 6 | 2 | 0 | |
| 사자 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 호랑이 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 곰 | 통과 | 5 | 4 | 0 | |
| 기린 | 통과 | 14 | 0 | 0 | |
| 물고기 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 돌고래 | 통과 | 3 | 0 | 0 | |
| 거북이 | 통과 | 8 | 1 | 0 | |
| 오리 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 펭귄 | 통과 | 5 | 2 | 0 | |
| 나비 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 무당벌레 | 통과 | 6 | 0 | 0 | |
| 공룡 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL |
| 개구리 | 통과 | 2 | 0 | 0 | |
| 뱀 | 통과 | 2 | 0 | 0 | |
| 말 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·flat: PEN_SEGMENT_TOO_SHORT, high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 다람쥐 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·flat: PEN_GAP_TOO_SMALL, high·flat: PEN_GAP_TOO_SMALL |
| 조개 | 통과 | 4 | 1 | 0 | |
| 새 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL |
| 꿀벌 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 문어 | 통과 | 5 | 0 | 0 | |
| 게 | 통과 | 14 | 0 | 0 | |
| 상어 | 통과 | 12 | 1 | 0 | |
| 소 | 통과 | 8 | 0 | 0 | |
| 돼지 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 양 | 통과 | 3 | 0 | 0 | |
| 여우 | 통과 | 9 | 2 | 0 | |
| 판다 | 통과 | 7 | 5 | 0 | |
| 연필 | 통과 | 7 | 0 | 0 | |
| 가위 | 통과 | 5 | 1 | 2 | |
| 책 | 통과 | 6 | 1 | 0 | |
| 컵 | 통과 | 4 | 0 | 1 | |
| 의자 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 우산 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_GAP_TOO_SMALL |
| 시계 | 통과 | 8 | 2 | 0 | |
| 안경 | 통과 | 3 | 2 | 0 | |
| 모자 | 통과 | 3 | 2 | 0 | |
| 신발 | 통과 | 11 | 0 | 0 | |
| 열쇠 | 통과 | 1 | 0 | 1 | |
| 전구 | 통과 | 6 | 1 | 0 | |
| 휴대폰 | 통과 | 2 | 1 | 0 | |
| 가방 | 통과 | 3 | 1 | 0 | |
| 숟가락 | 통과 | 1 | 0 | 0 | |
| 포크 | 통과 | 2 | 0 | 0 | |
| 주사기 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·flat: PEN_SEGMENT_TOO_SHORT, middle·solid: PEN_SEGMENT_TOO_SHORT |
| 붓 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 펜 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 자 | 통과 | 8 | 0 | 0 | |
| 자물쇠 | 통과 | 2 | 0 | 0 | |
| 기타 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 북 | 통과 | 9 | 1 | 0 | |
| 사진기 | 통과 | 3 | 1 | 0 | |
| 나무 | 통과 | 2 | 0 | 0 | |
| 꽃 | 통과 | 3 | 0 | 0 | |
| 해 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_PART_OUT_OF_PAGE, elementary·solid: PEN_PART_OUT_OF_PAGE, middle·flat: PEN_PART_OUT_OF_PAGE, middle·solid: PEN_PART_OUT_OF_PAGE |
| 달 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 별 | 통과 | 1 | 0 | 0 | |
| 구름 | 통과 | 2 | 0 | 0 | |
| 눈송이 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 무지개 | 통과 | 6 | 0 | 0 | |
| 잎 | 통과 | 5 | 0 | 0 | |
| 선인장 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 버섯 | 통과 | 5 | 0 | 1 | |
| 사과 | 통과 | 3 | 0 | 0 | |
| 수박 | 통과 | 3 | 0 | 0 | |
| 바나나 | 통과 | 9 | 1 | 0 | |
| 당근 | 통과 | 6 | 0 | 0 | |
| 딸기 | 통과 | 12 | 4 | 0 | |
| 불꽃 | 통과 | 2 | 0 | 0 | |
| 해바라기 | 통과 | 2 | 0 | 0 | |
| 단풍잎 | 통과 | 1 | 0 | 0 | |
| 밤 | 통과 | 6 | 0 | 0 | |
| 귤 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 포도 | 통과 | 1 | 0 | 0 | |
| 파인애플 | 통과 | 3 | 0 | 2 | |
| 고추 | 통과 | 2 | 0 | 0 | |
| 집 | 통과 | 10 | 3 | 0 | |
| 학교 | 통과 | 14 | 4 | 0 | |
| 성 | 통과 | 14 | 3 | 0 | |
| 탑 | 통과 | 10 | 0 | 1 | |
| 텐트 | 통과 | 7 | 0 | 0 | |
| 다리 | 통과 | 3 | 1 | 2 | |
| 병원 | 통과 | 14 | 2 | 0 | |
| 편의점 | 통과 | 14 | 2 | 0 | |
| 교회 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 하트 | 통과 | 1 | 0 | 0 | |
| 왕관 | 통과 | 6 | 0 | 0 | |
| 트로피 | 통과 | 6 | 0 | 0 | |
| 메달 | 통과 | 4 | 1 | 0 | |
| 리본 | 통과 | 4 | 0 | 0 | |
| 눈사람 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_PART_OUT_OF_PAGE, middle·flat: PEN_PART_OUT_OF_PAGE, high·flat: PEN_PART_OUT_OF_PAGE |
| 유령 | 통과 | 2 | 1 | 0 | |
| 선물상자 | 통과 | 6 | 0 | 0 | |
| 방패 | 통과 | 3 | 2 | 0 | |
| 축구공 | 통과 | 14 | 6 | 0 | |
| 음표 | 통과 | 1 | 0 | 0 | |
| 농구공 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 야구공 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_PART_OUT_OF_PAGE, middle·flat: PEN_PART_OUT_OF_PAGE, high·flat: PEN_PART_OUT_OF_PAGE |
| 과녁 | 통과 | 5 | 0 | 0 | |
| 백점 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 반짝임 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 자동차 | 통과 | 3 | 2 | 0 | |
| 버스 | 통과 | 12 | 0 | 0 | |
| 기차 | 통과 | 13 | 2 | 0 | |
| 비행기 | 통과 | 7 | 0 | 0 | |
| 로켓 | 통과 | 5 | 2 | 0 | |
| 배 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·flat: PEN_ANGLE_TOO_SHARP, elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 자전거 | 통과 | 10 | 2 | 2 | |
| 오토바이 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL |
| 트럭 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·solid: PEN_SEGMENT_TOO_SHORT |
| 소방차 | 통과 | 8 | 3 | 0 | |
| 구급차 | 통과 | 8 | 2 | 0 | |
| 헬리콥터 | 통과 | 11 | 3 | 0 | |
| 트랙터 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 로봇 | 통과 | 13 | 1 | 0 | |
| 킥보드 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·flat: PEN_ANGLE_TOO_SHARP, elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 여객선 | 통과 | 14 | 1 | 0 | |
| 비행접시 | 통과 | 4 | 0 | 0 | |

## held-out — 코퍼스에 넣지 않는 단어

코퍼스가 없는 단어에서 품질이 어떤지를 재기 위한 대조군이다. **이 줄을 코퍼스로 옮기지 말 것** —
옮기면 `held-out` 통과율이 `in-corpus` 통과율로 바뀌고, 그 숫자는 아무것도 증명하지 않는다.

`쥐` · `유니콘` · `비둘기` · `공작` · `홍학` · `달팽이` · `거미` · `가재` · `물범` · `나무늘보` · `벼` · `브로콜리` · `양파` · `마늘` · `땅콩` · `꿀` · `얼음` · `화산` · `산` · `섬` · `관람차` · `롤러코스터` · `회전목마` · `공장` · `분수` · `신전` · `모스크` · `신사` · `서커스천막` · `승합차` · `롤러스케이트` · `스케이트보드` · `스쿠터` · `케이블카` · `인공위성` · `망원경` · `시험관` · `자석` · `소화기` · `쇼핑카트` · `공구상자` · `등잔` · `실타래` · `뜨개질` · `탬버린` · `색소폰` · `트럼펫` · `밴조` · `골대` · `물안경`

## 저작자 표시

아트: Twemoji — CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
표시는 도안 범례에도 들어간다. 이것은 플랫폼의 저작권 판정이 아니라 **우리가 쓰는 소스의
사용 조건**이다 — 강사의 입력을 막거나 치환하거나 경고하지 않는다 (ADR-042).
