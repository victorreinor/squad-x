# Squad X

Jogo de celular em 3D, no estilo dos anúncios "gate runner": um esquadrão corre por uma pista, atira sozinho, passa por portais de conta (`+8`, `×2`, `÷2`), abre barris (armas, veículos, soldados), desvia de armadilhas e de um bombardeiro, e enfrenta um chefão por mundo. Uma loja de melhorias muda o jogo: **a dificuldade de cada fase é calibrada em volta do que o jogador já pôde comprar**. Arte e som são originais, gerados por código.

- **Repositório:** github.com/victorreinor/squad-x (branch `master`)
- **Referência de código e convenções:** `/Users/victorreinor/projects/bomb-arena` (projeto do mesmo autor; daqui saíram `rng.ts` e o jeito de organizar o monorepo)
- **Folha de referência visual** (todos os personagens, perigos, mundos e telas, com os números de cada um): `docs/design-system.html`. É um arquivo só, abra no navegador. Também existe como artifact do Claude, publicado em https://claude.ai/artifact/1T1ycPhjGeq8dYDYdFtZas (privado).

Leia também: `docs/ARCHITECTURE.md` (como funciona por dentro e as receitas para adicionar coisas), `docs/DECISIONS.md` (por que foi feito assim) e `docs/ROADMAP.md` (o que está feito e o que falta).

## Idioma

- Fale com o usuário em **português do Brasil**. Textos da interface e os documentos em `docs/` também são em pt-BR. O **nome do jogo é em inglês** (pedido do usuário).
- Código, comentários, nomes e mensagens de commit são em **inglês**.

## Comandos

Use Bun (`bun install`) e o Node do `.nvmrc`. Rode tudo a partir da raiz.

| Comando | O que faz |
|---|---|
| `bun run dev` | Cliente (Vite, porta 5183, escutando na rede para abrir no celular) |
| `bun run test` | Testes da engine, incluindo o equilíbrio das fases com e sem loja (leva alguns segundos) |
| `bun run typecheck` | `tsc` na engine e no cliente |
| `bun run build` | Build de produção do cliente |
| `bun run calibrate` | Joga as 50 fases com bots e regrava `packages/engine/src/pressures.ts`. Rode sempre que mexer em regras, gerador, bots ou loja. `bun run calibrate 50 3,4` recalibra só algumas |

Atalhos na URL (só para olhar e testar): `?bot=1` deixa o bot da engine jogar a fase sozinho (selo 🤖 BOT); `?galeria=1` abre a galeria dos modelos (abas, arraste para girar, botão "ângulo do jogo").

No celular: computador e celular na mesma Wi-Fi, `http://<IP do Mac>:5183` (IP em `ipconfig getifaddr en0`). `localhost` no celular é o próprio celular.

## Estrutura

- `packages/engine` (`@squadx/engine`): regras, em TypeScript puro e determinístico. Sem DOM, sem `Math.random()`, sem `Date.now()`; o acaso vem de `state.rng` (mulberry32). O estado é JSON serializável.
  - `game.ts`: `createGame`, `step` (um tick a 30 Hz), tiro por colunas (soldados e veículos), portais, barris, inimigos, chefão, armadilhas, bombardeio, `starsFor`.
  - `levels.ts`: `generateLevel(spec)` monta a fase a partir de semente, modo, característica e **traço do esquadrão**; `campaignSpec(n)` descreve a fase n (10 por mundo, chefão na 5ª e na 10ª).
  - `calibrate.ts` + `pressures.ts`: `calibratePressure(n)` joga a fase com bots (com e sem as melhorias esperadas) e acha a pressão mais alta que ainda é vencível. O resultado e o esquadrão medido ficam na tabela gerada `PRESSURES`; `campaignLevel(n)` monta a fase a partir dela. **O jogo usa sempre `campaignLevel`.**
  - `upgrades.ts`: a loja (dano, reforços, resistência, butim), custos, `runPayout` e `expectedUpgrades(n)` (o que um jogador típico já comprou até a fase n).
  - `bot.ts`: jogadores para os testes e para a calibração (`SKILLED_BOT`, `AVERAGE_BOT`; "parado" é `IDLE`).
  - `constants.ts`: todo número ajustável, com unidade no comentário.
- `apps/web` (`@squadx/web`): React 19 + Vite + Three.js. O React cuida do menu, da loja e do HUD; a partida roda num loop de `requestAnimationFrame` com passo fixo.
  - `game/scene.ts`: a cena 3D inteira, desenhada a partir do `GameState`; `scenery.ts` (ponte, barreiras, cidade, deserto, neve, vulcão, horizonte), `figures.ts` (soldado, inimigos, chefões, armas, a partir de peças), `crowd.ts` (desenha centenas de figuras com `InstancedMesh` e contorno), `vehicles.ts`, `props.ts` (espinhos, mina, bombardeiro, bomba), `themes.ts`.
  - `game/Game.tsx` (loop, entrada, HUD, relatório), `hud.tsx` (painel, contadores, avisos), `feed.ts` (avisos do que aconteceu), `audio.ts` e `sfx.ts` (som sintetizado), `progress.ts` (`localStorage`), `modes.ts` e `names.ts` (textos).
  - `Gallery.tsx`: a galeria dos modelos (`?galeria=1`).
- `tools/calibrate.ts`: o script do `bun run calibrate`.
- `docs`: arquitetura, decisões, roadmap e a folha de referência visual.
- `.github/readme`: as figuras do README (capturas do jogo e da galeria).

## Regras que não podem quebrar

1. **A engine não conhece o desenho.** Nada de Three.js, DOM ou som em `packages/engine`. O cliente só lê o `GameState`; efeitos, sons e avisos saem da **diferença entre dois estados** (`playSounds`, `deriveFeed`, `tickEffects`). Nunca crie regra de jogo só no cliente.
2. **A engine é determinística.** O acaso vem de `state.rng` (e do gerador por semente). O estado é JSON serializável.
3. **Coordenadas:** na engine, `x` é lateral (-4 a +4) e `z` é a distância corrida. Na cena o `z` é invertido (`Z(z) = -z`) para a câmera olhar para a frente, com +x à direita.
4. **Todo número de jogo fica em `constants.ts`** (ou `upgrades.ts`), com unidade. Nada de números mágicos nas regras.
5. **Fase nova = dado, não código.** Ajuste dificuldade, modo e característica em `campaignSpec`/`generateLevel`. As hordas, os barris e os números dos portais são dimensionados pelo **esquadrão medido** (`SquadTrace`), então mexer em portais ou recompensas muda a dificuldade junto.
6. **Mexeu em regra, gerador, bot ou loja? Rode `bun run calibrate` e depois `bun run test`.** A tabela `pressures.ts` é gerada: não edite à mão. Se um teste de equilíbrio falhar, rastreie a fase com um script temporário (fora do repo) antes de afrouxar um limite.
7. **A calibração joga a fase.** Qualquer coisa que deixe o bot bom pior ou melhor (um inimigo novo, uma armadilha) precisa de um comportamento no `bot.ts`, senão a fase calibra para "o bot que não sabe desviar".
8. **Arte e som são originais, gerados por código.** Nada de marca registrada nem de sprites ou sons de outros jogos (o jogo dos anúncios é só referência de gênero).
9. **Olhe no jogo antes de dizer que ficou bom.** Mudança visual se confere no navegador, em tamanho de celular (~390x780), **do ângulo da câmera do jogo** (alta, atrás e acima), e a galeria (`?galeria=1`) serve para ver o modelo de perto. Captura reduzida engana.

## Como trabalhar com o usuário

- **Commit, push e deploy só quando o usuário pedir, e cada pedido vale uma vez.** Ao terminar uma tarefa, relate e pergunte se ele quer o commit e o push.
- **Commits:** Conventional Commits em inglês (`feat(engine): …`, `fix(web): …`, `docs: …`, `chore: …`). O corpo explica o porquê. Código e docs vão em commits separados. A mensagem termina com a linha `Co-Authored-By:` que o ambiente indicar.
- **Toda entrega atualiza `docs/ROADMAP.md`** (marcar `[x]`, criar itens novos) e, se houve decisão de projeto, **`docs/DECISIONS.md`**. Os dois em pt-BR.
- **Antes de entregar:** `bun run typecheck`, `bun run test` e `bun run build`. Bug na engine se reproduz primeiro com um teste.
- **Sem arquivos soltos no repositório:** capturas, simulações e scripts de teste vão para um diretório temporário fora do repo (por exemplo `mktemp -d`).
- **O servidor de desenvolvimento do usuário** costuma ficar rodando na 5183. Não derrube. Para conferir algo, suba o seu em outra porta (`cd apps/web && bunx vite --port 5184 --strictPort`) e encerre só o que você abriu.
- **Licença:** PolyForm Strict 1.0.0 (arquivo `LICENSE`), a mesma do Bomb Arena. O código é público mas não é open source: não copie trechos para outros projetos sem o usuário pedir.
- **Só free tier.** Antes de propor um serviço novo, confira o limite gratuito dele.
- Quando a mudança for grande ou tiver mais de um caminho, apresente um plano curto e espere o "pode seguir".
- **O que o usuário pediu para o jogo** (e vale como norte): decisões de verdade (não só números maiores), progressão pela loja, punição que dói, eventos que surpreendem, e uma tela que sempre diz o que você tem e o que aconteceu. Detalhes em `docs/DECISIONS.md`.

## Estilo de código

- TypeScript `strict`, ESM e Bun workspaces (`@squadx/engine` é importado direto do código-fonte, sem build).
- Funções e constantes exportadas levam JSDoc curto (`/** … */`) explicando o que fazem e o porquê. Comentários são poucos e explicam a intenção, não repetem o código. Imite o arquivo ao redor.
- Prefira estender o que já existe (`firstTarget`, `soldiersInStrip`, `loseSoldiers`, `columnXs`, `Crowd`, `PartSpec`…) a criar cópias parecidas.
- Os testes ficam em `packages/engine/test/*.test.ts` e usam os helpers de `test/helpers.ts` (`emptyLevel`, `run`, `play`). Teste lento de equilíbrio leva timeout explícito.
- No React, o estado do jogo fica fora do React (refs e o loop de frames). O HUD só atualiza quando algo visível muda (`sameHud`); os avisos entram por `setFeed` só quando há notícia.
- O CSS fica todo em `apps/web/src/styles.css`. Animações respeitam `prefers-reduced-motion`.

## Armadilhas conhecidas

- **O traço do esquadrão se mede em loop.** Os portais dependem do traço e o traço dos portais; `settledTrace` mede de novo 3 vezes para estabilizar. Medir uma vez só deixa números de portal descolados do esquadrão real (já deu `-131` contra 60 soldados).
- **Barril protege, portal não.** `firstTarget` atira no primeiro inimigo ou barril da coluna; portal só leva tiro quando não há nada na coluna, e portal travado (`locked`) nunca leva. O bot sai da faixa de um barril quando uma horda se aproxima.
- **Veículos e armadura.** Tanque e helicóptero ignoram a armadura do policial de choque (`pierce`); a moto não.
- **A Resistência acumula frações.** `loseSoldiers` guarda o resto (`lossCarry`) para virar soldado inteiro; não arredonde cada golpe.
- **O chefão não se mexe.** Fica parado na pista e bloqueia o avanço a 14 unidades. A linha de chegada fica depois dele. Os lacaios entram em `state.enemies` durante o passo, por isso a lista é reconstruída à mão (um `filter` os derrubaria).
- **Bombas caem em volta de um corredor seguro**, não perto do esquadrão. Antes caíam onde ele estava e era impossível fugir de todas.
- **Instâncias do Three.** Cada papel do boneco (`legL`, `armR`, `gun`…) é uma camada de `InstancedMesh`; `setGun` troca só a camada da arma. Peças de mesma cor são fundidas (`mergeGeometries`). O contorno é a mesma peça virada do avesso e 14% maior.
- **A câmera passa por cima do cenário.** Torres da ponte e afins precisam ser altas (as travessas ficam acima de ~30 unidades), senão cobrem a tela.
- **Aba escondida do Chrome pausa o jogo.** Para tirar screenshots, use um Chrome headless à parte (`puppeteer-core` com `--use-gl=angle --use-angle=swiftshader`); a aba de uma janela atrás de outra roda parada.
- O teste que passa "à toa" já aconteceu: compare com o valor inicial, e não com zero.

## Onde mexer

| Quero mudar… | Arquivo |
|---|---|
| Regras, física, tiro, portais, barris, armadilhas, bombardeio, chefão | `packages/engine/src/game.ts` (números em `constants.ts`) |
| Como as fases são montadas (modos, características, portais, hordas, eventos) | `packages/engine/src/levels.ts` |
| Dificuldade de uma fase | `bun run calibrate` (não edite `pressures.ts`) |
| Loja, preços, economia | `packages/engine/src/upgrades.ts` e `apps/web/src/screens/Shop.tsx` |
| O que o bot faz | `packages/engine/src/bot.ts` |
| Soldado, inimigos, chefões, armas | `apps/web/src/game/figures.ts` |
| Veículos, espinhos, mina, avião, bomba | `vehicles.ts`, `props.ts` |
| Cenários e clima de cada mundo | `scenery.ts`, `themes.ts` |
| A cena, efeitos de tiro e explosão, câmera | `apps/web/src/game/scene.ts` |
| Menu, loja, relatório, HUD | `App.tsx`, `screens/Shop.tsx`, `game/Game.tsx`, `hud.tsx` |
| Textos dos avisos | `game/feed.ts` |
| Sons e música | `game/audio.ts`, `game/sfx.ts` |
| Figuras do README | `.github/readme` (capturas; refazer quando o visual mudar muito) |
