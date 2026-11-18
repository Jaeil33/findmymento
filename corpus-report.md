# 코퍼스 적재 보고서

적재 시각: 2026-11-18T14:45:19.625Z

`atlas.mts` 와 달리 **LLM 을 한 번도 부르지 않는다.** 아트가 사람이 그린 것이므로
"그 단어로 보이는가" 의 답이 이미 정해져 있다 (ADR-041). 물리 검증은 그대로 받는다.

| 지표 | 값 |
|---|---|
| 시도한 단어 | 423개 |
| 들어간 것 | 319개 (75.4%) |
| 빠진 것 | 104개 |
| 목록 전체 | 329개 |
| held-out (적재 안 함) | 43개 |

## 기하 — 개편 전 LLM 윤곽과 비교

| 지표 | 코퍼스 | 개편 전 (LLM 윤곽) |
|---|---|---|
| 색 영역 개수 평균 | 7.2개 | 0개 (색이 없었다) |
| 내부선 개수 평균 | 1.4개 | 0.7개 |
| 구멍 개수 평균 | 0.2개 | 0개 |

## 단어별

| 단어 | 결과 | 영역 | 내부선 | 구멍 | 이유 |
|---|---|---|---|---|---|
| 코끼리 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 고양이 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 강아지 | 통과 | 10 | 1 | 0 | |
| 토끼 | 통과 | 6 | 2 | 0 | |
| 사자 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 호랑이 | 통과 | 8 | 2 | 0 | |
| 곰 | 통과 | 5 | 4 | 0 | |
| 기린 | 통과 | 14 | 0 | 0 | |
| 물고기 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 돌고래 | 통과 | 3 | 0 | 0 | |
| 거북이 | 통과 | 8 | 1 | 0 | |
| 오리 | 통과 | 8 | 0 | 0 | |
| 펭귄 | 통과 | 5 | 2 | 0 | |
| 나비 | 통과 | 14 | 2 | 2 | |
| 무당벌레 | 통과 | 6 | 0 | 0 | |
| 공룡 | 통과 | 14 | 0 | 0 | |
| 개구리 | 통과 | 2 | 0 | 0 | |
| 뱀 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 말 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, middle·flat: PEN_GAP_TOO_SMALL, middle·solid: PEN_GAP_TOO_SMALL, high·flat: PEN_GAP_TOO_SMALL |
| 다람쥐 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 조개 | 통과 | 4 | 2 | 0 | |
| 새 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL |
| 꿀벌 | 통과 | 7 | 1 | 0 | |
| 문어 | 통과 | 5 | 0 | 0 | |
| 게 | 통과 | 14 | 0 | 0 | |
| 상어 | 통과 | 12 | 1 | 0 | |
| 소 | 통과 | 8 | 0 | 0 | |
| 돼지 | 통과 | 2 | 1 | 0 | |
| 양 | 통과 | 3 | 0 | 0 | |
| 여우 | 통과 | 9 | 2 | 0 | |
| 판다 | 통과 | 7 | 5 | 0 | |
| 연필 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 가위 | 통과 | 5 | 1 | 2 | |
| 책 | 통과 | 6 | 1 | 0 | |
| 컵 | 통과 | 4 | 0 | 1 | |
| 의자 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 우산 | 통과 | 4 | 0 | 0 | |
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
| 붓 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 펜 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 자 | 통과 | 8 | 0 | 0 | |
| 자물쇠 | 통과 | 2 | 0 | 0 | |
| 기타 | 통과 | 10 | 5 | 0 | |
| 북 | 통과 | 9 | 1 | 0 | |
| 사진기 | 통과 | 3 | 1 | 0 | |
| 나무 | 통과 | 2 | 0 | 0 | |
| 꽃 | 통과 | 3 | 0 | 0 | |
| 해 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_PART_OUT_OF_PAGE, elementary·solid: PEN_PART_OUT_OF_PAGE, middle·flat: PEN_PART_OUT_OF_PAGE, middle·solid: PEN_PART_OUT_OF_PAGE |
| 달 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 별 | 통과 | 1 | 0 | 0 | |
| 구름 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, middle·solid: PEN_SEGMENT_TOO_SHORT |
| 눈송이 | 통과 | 3 | 0 | 0 | |
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
| 해바라기 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT, high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 단풍잎 | 통과 | 1 | 0 | 0 | |
| 밤 | 통과 | 6 | 0 | 0 | |
| 귤 | 통과 | 3 | 0 | 0 | |
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
| 축구공 | 통과 | 14 | 5 | 0 | |
| 음표 | 통과 | 1 | 0 | 0 | |
| 농구공 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT, high·solid: PEN_GAP_TOO_SMALL |
| 야구공 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_PART_OUT_OF_PAGE, middle·flat: PEN_PART_OUT_OF_PAGE, high·flat: PEN_PART_OUT_OF_PAGE |
| 과녁 | 통과 | 5 | 0 | 0 | |
| 백점 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 반짝임 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·flat: PEN_SEGMENT_TOO_SHORT, middle·solid: PEN_SEGMENT_TOO_SHORT |
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
| 킥보드 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_GAP_TOO_SMALL |
| 여객선 | 통과 | 14 | 1 | 0 | |
| 비행접시 | 통과 | 4 | 0 | 0 | |
| 원숭이 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_ANGLE_TOO_SHARP, elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_GAP_TOO_SMALL |
| 고릴라 | 통과 | 9 | 3 | 0 | |
| 늑대 | 통과 | 9 | 2 | 0 | |
| 너구리 | 통과 | 14 | 2 | 0 | |
| 표범 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·solid: PEN_SEGMENT_TOO_SHORT |
| 얼룩말 | 통과 | 14 | 0 | 0 | |
| 사슴 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_ANGLE_TOO_SHARP, elementary·flat: PEN_GAP_TOO_SMALL, middle·solid: PEN_ANGLE_TOO_SHARP, middle·solid: PEN_GAP_TOO_SMALL |
| 황소 | 통과 | 2 | 0 | 0 | |
| 염소 | 통과 | 4 | 0 | 0 | |
| 낙타 | 통과 | 2 | 1 | 0 | |
| 라마 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT |
| 코뿔소 | 통과 | 8 | 1 | 0 | |
| 하마 | 통과 | 7 | 2 | 0 | |
| 햄스터 | 통과 | 9 | 1 | 0 | |
| 비버 | 통과 | 14 | 1 | 0 | |
| 고슴도치 | 통과 | 14 | 3 | 0 | |
| 박쥐 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 코알라 | 통과 | 4 | 3 | 0 | |
| 수달 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 오소리 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 스컹크 | 통과 | 4 | 0 | 0 | |
| 물소 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL |
| 멧돼지 | 통과 | 11 | 5 | 0 | |
| 푸들 | 통과 | 14 | 2 | 0 | |
| 칠면조 | 통과 | 13 | 0 | 0 | |
| 닭 | 통과 | 5 | 2 | 0 | |
| 수탉 | 통과 | 5 | 0 | 0 | |
| 병아리 | 통과 | 5 | 0 | 0 | |
| 독수리 | 통과 | 4 | 1 | 0 | |
| 백조 | 통과 | 6 | 0 | 0 | |
| 부엉이 | 통과 | 14 | 0 | 0 | |
| 앵무새 | 통과 | 11 | 0 | 0 | |
| 깃털 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 악어 | 통과 | 6 | 2 | 0 | |
| 도마뱀 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_ANGLE_TOO_SHARP, elementary·solid: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_ANGLE_TOO_SHARP |
| 용 | 통과 | 11 | 3 | 0 | |
| 고래 | 통과 | 2 | 0 | 0 | |
| 복어 | 통과 | 7 | 0 | 0 | |
| 애벌레 | 통과 | 14 | 0 | 0 | |
| 개미 | 보류 | | | | 검증에서 걸렸습니다: high·solid: PEN_GAP_TOO_SMALL |
| 딱정벌레 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 전갈 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 모기 | 보류 | | | | 윤곽이 스스로 교차합니다 (꼬인 선은 떼어낼 때 찢어집니다) |
| 지렁이 | 통과 | 14 | 1 | 0 | |
| 랍스터 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_PART_OUT_OF_PAGE, elementary·solid: PEN_PART_OUT_OF_PAGE, middle·flat: PEN_PART_OUT_OF_PAGE, middle·solid: PEN_PART_OUT_OF_PAGE |
| 새우 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·flat: PEN_ANGLE_TOO_SHARP, elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 오징어 | 통과 | 8 | 0 | 0 | |
| 꽃다발 | 통과 | 10 | 2 | 0 | |
| 벚꽃 | 통과 | 14 | 5 | 1 | |
| 장미 | 통과 | 3 | 0 | 0 | |
| 무궁화 | 통과 | 6 | 2 | 0 | |
| 새싹 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 화분 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_GAP_TOO_SMALL |
| 전나무 | 통과 | 10 | 0 | 0 | |
| 야자나무 | 통과 | 8 | 0 | 0 | |
| 네잎클로버 | 통과 | 1 | 0 | 0 | |
| 낙엽 | 통과 | 4 | 0 | 0 | |
| 허브 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_GAP_TOO_SMALL |
| 멜론 | 통과 | 6 | 3 | 0 | |
| 레몬 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 망고 | 통과 | 4 | 2 | 0 | |
| 풋사과 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 서양배 | 통과 | 2 | 0 | 0 | |
| 복숭아 | 통과 | 4 | 1 | 0 | |
| 체리 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 키위 | 통과 | 8 | 4 | 2 | |
| 토마토 | 통과 | 2 | 0 | 0 | |
| 코코넛 | 통과 | 13 | 3 | 1 | |
| 아보카도 | 통과 | 6 | 4 | 0 | |
| 가지 | 통과 | 2 | 0 | 0 | |
| 감자 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 옥수수 | 통과 | 14 | 3 | 0 | |
| 피망 | 통과 | 4 | 0 | 0 | |
| 오이 | 통과 | 5 | 3 | 0 | |
| 식빵 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 크루아상 | 통과 | 5 | 0 | 0 | |
| 바게트 | 통과 | 11 | 0 | 0 | |
| 프레첼 | 통과 | 5 | 2 | 2 | |
| 베이글 | 통과 | 11 | 3 | 0 | |
| 팬케이크 | 통과 | 12 | 1 | 0 | |
| 와플 | 통과 | 14 | 4 | 0 | |
| 치즈 | 통과 | 11 | 3 | 0 | |
| 햄버거 | 통과 | 14 | 1 | 0 | |
| 감자튀김 | 통과 | 7 | 5 | 0 | |
| 피자 | 통과 | 7 | 0 | 0 | |
| 핫도그 | 통과 | 4 | 2 | 0 | |
| 샌드위치 | 통과 | 9 | 4 | 0 | |
| 타코 | 통과 | 11 | 0 | 0 | |
| 달걀 | 통과 | 2 | 0 | 0 | |
| 샐러드 | 통과 | 12 | 2 | 0 | |
| 팝콘 | 통과 | 11 | 0 | 0 | |
| 도시락 | 통과 | 14 | 5 | 0 | |
| 주먹밥 | 통과 | 9 | 5 | 0 | |
| 초밥 | 통과 | 14 | 2 | 2 | |
| 새우튀김 | 통과 | 6 | 0 | 0 | |
| 만두 | 통과 | 14 | 0 | 0 | |
| 라면 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·flat: PEN_SEGMENT_TOO_SHORT, middle·solid: PEN_SEGMENT_TOO_SHORT, high·flat: PEN_GAP_TOO_SMALL |
| 스파게티 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL |
| 고구마 | 통과 | 5 | 2 | 0 | |
| 아이스크림 | 통과 | 7 | 0 | 0 | |
| 도넛 | 통과 | 14 | 4 | 1 | |
| 쿠키 | 통과 | 9 | 5 | 0 | |
| 생일케이크 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, middle·flat: PEN_SEGMENT_TOO_SHORT |
| 케이크 | 통과 | 7 | 1 | 0 | |
| 컵케이크 | 통과 | 14 | 4 | 0 | |
| 파이 | 통과 | 14 | 3 | 1 | |
| 초콜릿 | 통과 | 5 | 0 | 0 | |
| 사탕 | 보류 | | | | 검증에서 걸렸습니다: middle·solid: PEN_GAP_TOO_SMALL, high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 막대사탕 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 우유 | 통과 | 8 | 3 | 0 | |
| 찻주전자 | 통과 | 7 | 0 | 0 | |
| 젓가락 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 부엌칼 | 통과 | 3 | 0 | 0 | |
| 지구 | 통과 | 1 | 0 | 0 | |
| 나침반 | 통과 | 3 | 0 | 0 | |
| 사막 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_SEGMENT_TOO_SHORT |
| 경기장 | 보류 | | | | 검증에서 걸렸습니다: middle·solid: PEN_SEGMENT_TOO_SHORT |
| 벽돌 | 통과 | 6 | 3 | 0 | |
| 바위 | 통과 | 14 | 4 | 0 | |
| 통나무 | 통과 | 10 | 4 | 2 | |
| 오두막 | 통과 | 14 | 0 | 0 | |
| 빌딩 | 통과 | 14 | 2 | 0 | |
| 은행 | 통과 | 14 | 4 | 0 | |
| 호텔 | 통과 | 14 | 1 | 0 | |
| 백화점 | 통과 | 14 | 0 | 0 | |
| 우체국 | 통과 | 12 | 1 | 0 | |
| 자유의여신상 | 통과 | 7 | 4 | 1 | |
| 기관차 | 통과 | 14 | 0 | 0 | |
| 고속열차 | 통과 | 9 | 0 | 0 | |
| 지하철 | 통과 | 11 | 3 | 0 | |
| 전차 | 통과 | 14 | 2 | 0 | |
| 모노레일 | 통과 | 14 | 0 | 0 | |
| 택시 | 통과 | 5 | 2 | 0 | |
| 경찰차 | 통과 | 8 | 1 | 0 | |
| 미니버스 | 통과 | 10 | 2 | 0 | |
| 픽업트럭 | 통과 | 6 | 1 | 0 | |
| 배달트럭 | 통과 | 4 | 1 | 0 | |
| 경주용차 | 통과 | 8 | 3 | 0 | |
| 휠체어 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 정류장 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 주유기 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·flat: PEN_GAP_TOO_SMALL, middle·solid: PEN_GAP_TOO_SMALL |
| 신호등 | 통과 | 4 | 3 | 0 | |
| 정지표지판 | 통과 | 2 | 1 | 1 | |
| 닻 | 통과 | 2 | 0 | 1 | |
| 카누 | 통과 | 4 | 1 | 0 | |
| 모터보트 | 통과 | 11 | 2 | 0 | |
| 낙하산 | 통과 | 14 | 4 | 0 | |
| 경비행기 | 통과 | 14 | 2 | 0 | |
| 손목시계 | 통과 | 5 | 2 | 0 | |
| 모래시계 | 통과 | 4 | 1 | 0 | |
| 초시계 | 통과 | 6 | 3 | 1 | |
| 보름달 | 보류 | | | | 색 영역을 뽑지 못했습니다 |
| 유성 | 통과 | 4 | 3 | 0 | |
| 토성 | 통과 | 5 | 2 | 0 | |
| 온도계 | 통과 | 7 | 1 | 0 | |
| 토네이도 | 통과 | 10 | 0 | 0 | |
| 물방울 | 통과 | 1 | 0 | 0 | |
| 파도 | 통과 | 2 | 0 | 0 | |
| 번개 | 통과 | 1 | 0 | 0 | |
| 혜성 | 통과 | 4 | 3 | 0 | |
| 호박등 | 통과 | 6 | 4 | 0 | |
| 크리스마스트리 | 통과 | 11 | 1 | 0 | |
| 폭죽 | 통과 | 11 | 5 | 0 | |
| 풍선 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 꽃가루공 | 보류 | | | | 검증에서 걸렸습니다: middle·solid: PEN_GAP_TOO_SMALL |
| 풍경 | 통과 | 4 | 1 | 0 | |
| 티켓 | 통과 | 5 | 4 | 2 | |
| 금메달 | 통과 | 4 | 1 | 0 | |
| 배구공 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·solid: PEN_GAP_TOO_SMALL, high·flat: PEN_GAP_TOO_SMALL |
| 미식축구공 | 통과 | 6 | 1 | 0 | |
| 럭비공 | 통과 | 3 | 0 | 0 | |
| 테니스공 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_PART_OUT_OF_PAGE, elementary·solid: PEN_PART_OUT_OF_PAGE, middle·flat: PEN_PART_OUT_OF_PAGE, middle·solid: PEN_PART_OUT_OF_PAGE |
| 원반 | 통과 | 4 | 2 | 0 | |
| 볼링공 | 통과 | 6 | 1 | 0 | |
| 탁구채 | 통과 | 3 | 0 | 0 | |
| 배드민턴 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_GAP_TOO_SMALL, middle·solid: PEN_SEGMENT_TOO_SHORT |
| 권투글러브 | 통과 | 5 | 1 | 0 | |
| 스케이트 | 통과 | 8 | 2 | 0 | |
| 낚싯대 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_ANGLE_TOO_SHARP, elementary·solid: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 스키 | 통과 | 12 | 2 | 0 | |
| 썰매 | 통과 | 13 | 4 | 0 | |
| 요요 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 연 | 보류 | | | | 검증에서 걸렸습니다: middle·flat: PEN_GAP_TOO_SMALL, middle·solid: PEN_GAP_TOO_SMALL, high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 당구공 | 통과 | 1 | 0 | 2 | |
| 수정구 | 통과 | 2 | 0 | 0 | |
| 마법봉 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 주사위 | 통과 | 8 | 3 | 2 | |
| 퍼즐조각 | 통과 | 1 | 0 | 0 | |
| 곰인형 | 통과 | 14 | 1 | 0 | |
| 팔레트 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 바늘 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_GAP_TOO_SMALL, middle·flat: PEN_SEGMENT_TOO_SHORT |
| 선글라스 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 넥타이 | 통과 | 7 | 2 | 0 | |
| 티셔츠 | 통과 | 6 | 0 | 0 | |
| 청바지 | 통과 | 7 | 2 | 0 | |
| 목도리 | 보류 | | | | 검증에서 걸렸습니다: high·flat: PEN_GAP_TOO_SMALL |
| 장갑 | 통과 | 7 | 2 | 0 | |
| 외투 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·flat: PEN_GAP_TOO_SMALL, middle·solid: PEN_GAP_TOO_SMALL, high·flat: PEN_GAP_TOO_SMALL |
| 양말 | 통과 | 14 | 0 | 0 | |
| 원피스 | 통과 | 5 | 3 | 0 | |
| 배낭 | 통과 | 9 | 2 | 0 | |
| 구두 | 통과 | 7 | 0 | 0 | |
| 등산화 | 통과 | 14 | 0 | 0 | |
| 하이힐 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·flat: PEN_SEGMENT_TOO_SHORT, middle·solid: PEN_SEGMENT_TOO_SHORT |
| 학사모 | 통과 | 5 | 0 | 0 | |
| 야구모자 | 통과 | 5 | 0 | 0 | |
| 헬멧 | 통과 | 7 | 2 | 0 | |
| 립스틱 | 통과 | 5 | 2 | 0 | |
| 반지 | 통과 | 6 | 0 | 1 | |
| 보석 | 통과 | 6 | 0 | 0 | |
| 종 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 확성기 | 통과 | 2 | 0 | 1 | |
| 마이크 | 통과 | 5 | 0 | 0 | |
| 헤드폰 | 통과 | 5 | 0 | 0 | |
| 라디오 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, high·solid: PEN_GAP_TOO_SMALL |
| 아코디언 | 통과 | 14 | 0 | 0 | |
| 건반 | 통과 | 8 | 5 | 0 | |
| 바이올린 | 통과 | 7 | 4 | 0 | |
| 전화기 | 통과 | 11 | 4 | 0 | |
| 배터리 | 통과 | 5 | 2 | 0 | |
| 플러그 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·solid: PEN_SEGMENT_TOO_SHORT |
| 노트북 | 통과 | 5 | 3 | 0 | |
| 프린터 | 통과 | 10 | 2 | 0 | |
| 키보드 | 통과 | 14 | 5 | 0 | |
| 마우스 | 통과 | 2 | 0 | 0 | |
| 시디 | 통과 | 5 | 4 | 1 | |
| 주판 | 통과 | 14 | 5 | 1 | |
| 영사기 | 통과 | 2 | 0 | 2 | |
| 텔레비전 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 비디오카메라 | 통과 | 3 | 0 | 0 | |
| 돋보기 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 양초 | 통과 | 7 | 3 | 0 | |
| 손전등 | 통과 | 7 | 0 | 0 | |
| 홍등 | 통과 | 9 | 0 | 0 | |
| 망치 | 통과 | 2 | 0 | 0 | |
| 도끼 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 곡괭이 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 단검 | 통과 | 9 | 0 | 0 | |
| 폭탄 | 통과 | 2 | 0 | 0 | |
| 부메랑 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·flat: PEN_SEGMENT_TOO_SHORT, middle·solid: PEN_SEGMENT_TOO_SHORT |
| 활 | 통과 | 13 | 1 | 0 | |
| 톱 | 통과 | 4 | 0 | 1 | |
| 스패너 | 통과 | 1 | 0 | 0 | |
| 드라이버 | 통과 | 10 | 3 | 0 | |
| 나사 | 통과 | 14 | 1 | 0 | |
| 톱니바퀴 | 통과 | 1 | 0 | 1 | |
| 저울 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |
| 사다리 | 통과 | 12 | 6 | 0 | |
| 갈고리 | 통과 | 10 | 4 | 1 | |
| 현미경 | 통과 | 10 | 1 | 1 | |
| 위성안테나 | 통과 | 8 | 1 | 0 | |
| 알약 | 통과 | 2 | 0 | 0 | |
| 반창고 | 통과 | 4 | 2 | 0 | |
| 청진기 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_ANGLE_TOO_SHARP, elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_GAP_TOO_SMALL |
| 문 | 통과 | 7 | 5 | 0 | |
| 거울 | 통과 | 13 | 5 | 0 | |
| 창문 | 통과 | 6 | 4 | 0 | |
| 침대 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 소파 | 통과 | 11 | 1 | 1 | |
| 욕조 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_GAP_TOO_SMALL |
| 면도기 | 통과 | 10 | 2 | 0 | |
| 안전핀 | 통과 | 5 | 1 | 1 | |
| 빗자루 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT, middle·solid: PEN_SEGMENT_TOO_SHORT |
| 바구니 | 통과 | 14 | 2 | 0 | |
| 양동이 | 통과 | 4 | 1 | 0 | |
| 비누 | 통과 | 3 | 1 | 0 | |
| 칫솔 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 스펀지 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 모아이 | 통과 | 8 | 2 | 0 | |
| 공책 | 통과 | 14 | 0 | 0 | |
| 두루마리 | 통과 | 9 | 3 | 0 | |
| 신문 | 통과 | 10 | 4 | 0 | |
| 책갈피 | 통과 | 9 | 0 | 1 | |
| 돈가방 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 동전 | 통과 | 14 | 2 | 0 | |
| 신용카드 | 통과 | 4 | 2 | 0 | |
| 편지 | 통과 | 5 | 0 | 0 | |
| 소포 | 통과 | 8 | 0 | 0 | |
| 우체통 | 통과 | 7 | 4 | 0 | |
| 만년필 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 크레파스 | 통과 | 5 | 1 | 0 | |
| 서류가방 | 통과 | 4 | 1 | 1 | |
| 달력 | 통과 | 7 | 4 | 0 | |
| 클립보드 | 통과 | 8 | 4 | 0 | |
| 압정 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 클립 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_SEGMENT_TOO_SHORT, elementary·solid: PEN_GAP_TOO_SMALL |
| 삼각자 | 통과 | 1 | 0 | 1 | |
| 휴지통 | 통과 | 3 | 1 | 2 | |
| 삼각형 | 통과 | 1 | 0 | 0 | |
| 다이아몬드 | 통과 | 1 | 0 | 0 | |
| 체크표시 | 통과 | 1 | 0 | 0 | |
| 더하기 | 통과 | 1 | 0 | 0 | |
| 무한기호 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_ANGLE_TOO_SHARP |
| 하트카드 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 스페이드 | 통과 | 1 | 0 | 0 | |
| 클로버 | 보류 | | | | 검증에서 걸렸습니다: elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 다이아카드 | 통과 | 1 | 0 | 0 | |
| 체스말 | 통과 | 4 | 3 | 0 | |
| 재활용표시 | 통과 | 9 | 0 | 0 | |
| 삼지창 | 보류 | | | | 검증에서 걸렸습니다: elementary·flat: PEN_SEGMENT_TOO_SHORT, elementary·flat: PEN_ANGLE_TOO_SHARP, elementary·flat: PEN_GAP_TOO_SMALL, elementary·solid: PEN_SEGMENT_TOO_SHORT |
| 이름표 | 통과 | 2 | 1 | 0 | |
| 여덟모별 | 보류 | | | | 검증에서 걸렸습니다: middle·solid: PEN_GAP_TOO_SMALL, high·flat: PEN_GAP_TOO_SMALL, high·solid: PEN_GAP_TOO_SMALL |

## held-out — 코퍼스에 넣지 않는 단어

코퍼스가 없는 단어에서 품질이 어떤지를 재기 위한 대조군이다. **이 줄을 코퍼스로 옮기지 말 것** —
옮기면 `held-out` 통과율이 `in-corpus` 통과율로 바뀌고, 그 숫자는 아무것도 증명하지 않는다.

`유니콘` · `비둘기` · `공작` · `홍학` · `달팽이` · `거미` · `가재` · `물범` · `벼` · `브로콜리` · `양파` · `마늘` · `땅콩` · `얼음` · `화산` · `섬` · `관람차` · `롤러코스터` · `회전목마` · `공장` · `분수` · `신전` · `모스크` · `신사` · `서커스천막` · `승합차` · `스쿠터` · `케이블카` · `인공위성` · `망원경` · `시험관` · `자석` · `소화기` · `쇼핑카트` · `공구상자` · `등잔` · `실타래` · `뜨개질` · `탬버린` · `색소폰` · `트럼펫` · `밴조` · `골대`

## 저작자 표시

아트: Twemoji — CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
표시는 도안 범례에도 들어간다. 이것은 플랫폼의 저작권 판정이 아니라 **우리가 쓰는 소스의
사용 조건**이다 — 강사의 입력을 막거나 치환하거나 경고하지 않는다 (ADR-042).
