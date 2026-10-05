# Squad X

Jogo de celular no estilo dos anúncios "gate runner": um esquadrão corre por uma pista, atira sozinho nas hordas e passa por portais de conta (`+8`, `-6`, `×2`) que dá para atirar para subir o número. Barris com vida soltam armas e soldados, e há chefões. O visual é 3D estilizado (Three.js), tudo montado por código, sem arquivos de modelo.

Referência de código e convenções: `/Users/victorreinor/projects/bomb-arena` (projeto do mesmo autor; daqui saíram `rng.ts` e a estrutura do monorepo).

## Idioma

- Fale com o usuário em **português do Brasil**. Textos da interface também são em pt-BR; o **nome do jogo é em inglês** (pedido do usuário).
- Código, comentários, nomes e mensagens de commit são em **inglês**.

## Comandos

Use Bun e o Node do `.nvmrc`. Rode tudo a partir da raiz.

| Comando | O que faz |
|---|---|
| `bun install` | Instala as dependências |
| `bun run dev` | Cliente (Vite, porta 5183) |
| `bun run test` | Testes da engine, incluindo o equilíbrio das fases com um bot |
| `bun run typecheck` | `tsc` na engine e no cliente |
| `bun run build` | Build de produção do cliente |
| `bun run calibrate` | Joga as 50 fases com bots e regrava `packages/engine/src/pressures.ts` (rodar sempre que mexer em regras, gerador, bots ou loja; `bun run calibrate 50 3,4` recalibra só algumas) |

**No celular:** com o Mac e o celular na mesma rede Wi-Fi, abra `http://<IP do Mac>:5183` no navegador do celular (o IP sai de `ipconfig getifaddr en0`; `localhost` no celular é o próprio celular). O Vite já escuta na rede (`host: true`); na primeira vez o macOS pode perguntar se permite conexões de entrada.

Atalhos: `?bot=1` na URL deixa o bot da engine jogar a fase sozinho; `?galeria=1` abre a galeria dos modelos (arraste para girar).

## Estrutura

- `packages/engine` (`@squadx/engine`): as regras, em TypeScript puro e determinístico. Sem DOM, sem `Math.random()`, sem `Date.now()`; o acaso vem de `state.rng` (mulberry32). O estado é JSON serializável.
  - `game.ts`: `createGame`, `step` (um tick a 30 Hz), disparo por colunas (soldados e veículos), portais, barris, os inimigos e o chefão, `starsFor`.
  - `upgrades.ts`: a loja (dano, reforços, butim), custos e `runPayout`.
  - `calibrate.ts` e `pressures.ts`: `calibratePressure(n)` joga a fase com o bot bom (com e sem as melhorias esperadas, `expectedUpgrades`) e acha a pressão mais alta que ainda é vencível; o resultado e o esquadrão medido ficam na tabela `PRESSURES`, e `campaignLevel(n)` monta a fase a partir dela. **O jogo usa sempre `campaignLevel`.**
  - `levels.ts`: `generateLevel(spec)` monta uma fase a partir de uma semente, de um modo (`gates`, `loot` ou `mixed`) e de uma dificuldade; `campaignSpec(n)` dá a fase n da campanha (10 fases por mundo, modos alternados, chefão na 5ª e na 10ª).
  - `bot.ts`: jogadores para os testes de equilíbrio (`SKILLED_BOT`, `AVERAGE_BOT`; "parado" é `IDLE`).
- `apps/web` (`@squadx/web`): React 19 + Vite + Three.js. O React cuida do menu e do HUD; a partida roda num loop de `requestAnimationFrame` com passo fixo.
  - `game/scene.ts`: a cena 3D inteira, desenhada a partir do `GameState`. `crowd.ts` desenha centenas de bonecos com `InstancedMesh`; `labels.ts` faz números em sprites; `figures.ts` monta soldado, inimigos, chefões e armas a partir de peças e `crowd.ts` desenha todos em instâncias com contorno; `vehicles.ts` monta moto, helicóptero e tanque; `audio.ts` sintetiza todo o som e `sfx.ts` decide quais sons tocar a partir da diferença entre dois estados; `themes.ts` tem os cenários; `modes.ts` tem os nomes dos modos de fase.
  - `game/Game.tsx`: loop, entrada (teclado ← → / A D e arrastar o dedo), HUD e tela de resultado.
  - `game/progress.ts`: progresso no `localStorage` (fase liberada, estrelas, moedas).

## Regras que não podem quebrar

1. **A engine não conhece o desenho.** Nada de Three.js ou DOM em `packages/engine`. O cliente só lê o `GameState`; efeitos (faíscas, tremor, popup do portal) saem da diferença entre dois estados.
2. **Coordenadas:** na engine, `x` é lateral (-4 a +4) e `z` é a distância corrida. Na cena 3D o `z` é invertido (`Z(z) = -z`) para a câmera olhar para a frente com +x à direita.
3. **Todo número de jogo fica em `constants.ts`** (com unidade no comentário). Nada de números mágicos nas regras.
4. **Fase nova = dado, não código.** Ajuste dificuldade e modo em `campaignSpec`/`generateLevel`; hordas e chefão são dimensionados pelo "poder" estimado do esquadrão ao longo da pista, então mexer nos portais muda a dificuldade junto.
5. **Mexeu em regra ou gerador? Rode `bun run test`.** Os testes de equilíbrio avaliam as fases da tabela em outras sementes: fases 1 e 2 vencíveis sem loja; da 3 em diante o bot bom sem loja perde; com a loja esperada ele vence ≥ 21 de 30 e quase sempre com baixas. **Mexeu em regra, gerador, bot ou loja? Rode `bun run calibrate` e depois `bun run test`.** Se um teste falhar, rastreie a fase com um script temporário antes de afrouxar um limite.
6. **Arte e som são originais, gerados por código.** Nada de marca registrada nem de sprites de outros jogos (o jogo dos anúncios é só referência de gênero).

## Como trabalhar com o usuário

- **Commit, push e deploy só quando o usuário pedir.**
- Commits em Conventional Commits, em inglês. Código e docs em commits separados.
- Quando a mudança for grande ou tiver mais de um caminho, apresente um plano curto e espere o "pode seguir".
- Mudança visual se confere no navegador, em tamanho de celular (~390x780).
