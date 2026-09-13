import '@testing-library/jest-dom/vitest'

// 시연용 AI 응답(ADR-025)은 기본으로 끈다. tests/demo-ai.test.ts 에서만 켠다.
process.env.DEMO_AI = 'off'
