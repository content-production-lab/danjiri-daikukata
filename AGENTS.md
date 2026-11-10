# AGENTS.md

- 地車の大工方ゲーム。Vite + TypeScript + three.js。GitHub Pages（`content-production-lab/danjiri-daikukata`）へ main への push で自動デプロイ。
- ゲーム量産工場（`C:\AI\projects\game-factory`）の管理下にある工場以前の既存作（旧版。後継は `danjiri-daikukata-blender`）。置き場所は `C:\AI\projects\_content\game\danjiri-daikukata`（2026-11-10 に直下から移動）。状態は工場の `games.md` に記録する。
- 挙動計算は `src/sim/` に閉じ、描画・DOM に依存させない。挙動を変えたら `src/sim/sim.test.ts` の完走・失敗ケースを確認する。
- 完了前に `npm run check`（lint・typecheck・test・build）を通す。
- 外部の画像・3D・音素材を追加する場合はライセンスを確認し、README に出典を書く。
