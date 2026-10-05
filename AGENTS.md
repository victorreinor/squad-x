# AGENTS.md

As instruções para agentes de código deste repositório (Claude Code, Codex, Cursor, Gemini, Copilot e outros) estão em **[CLAUDE.md](CLAUDE.md)**. Leia esse arquivo inteiro antes de mudar qualquer coisa: as regras valem para qualquer agente, não só para o Claude. Ele é a fonte única, então não copie o conteúdo para cá.

Depois dele, conforme a tarefa:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): como o jogo funciona por dentro e as receitas para adicionar inimigos, chefões, armas, perigos, melhorias e mundos.
- [docs/DECISIONS.md](docs/DECISIONS.md): por que cada coisa foi feita do jeito que está.
- [docs/ROADMAP.md](docs/ROADMAP.md): o que está pronto e o que falta.
- [docs/design-system.html](docs/design-system.html): a folha de referência visual de todos os personagens, perigos, mundos e telas, com os números de cada um.

Resumo do essencial:

- Responda em português do Brasil; o código e os commits são em inglês.
- A engine (`packages/engine`) não conhece o desenho: nada de Three.js, DOM ou som lá dentro.
- Mexeu em regra, gerador, bot ou loja? Rode `bun run calibrate` e depois `bun run test`.
- Antes de entregar, rode `bun run typecheck`, `bun run test` e `bun run build`.
- Faça commit, push ou deploy só quando o usuário pedir.
