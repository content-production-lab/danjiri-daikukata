# AGENTS.md

- 地車の大工方ゲーム。Vite + TypeScript + three.js。GitHub Pages（`content-production-lab/danjiri-daikukata`）へ main への push で自動デプロイ。
- 挙動計算は `src/sim/` に閉じ、描画・DOM に依存させない。挙動を変えたら `src/sim/sim.test.ts` の完走・失敗ケースを確認する。
- 完了前に `npm run check`（lint・typecheck・test・build）を通す。
- 外部の画像・3D・音素材を追加する場合はライセンスを確認し、README に出典を書く。
