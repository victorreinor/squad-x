# Arquitetura

Este documento explica como as partes se encaixam. As decisões (o porquê) estão em `DECISIONS.md`; o que falta fazer está em `ROADMAP.md`.

## Visão geral

```
 packages/engine (puro)                          apps/web
 ┌───────────────────────────────────────┐       ┌──────────────────────────────────┐
 │ levels.ts   gera a fase por semente   │       │ Game.tsx   loop de passo fixo    │
 │ game.ts     step: um tick a 30 Hz     │ estado│   ├─ scene.ts   cena 3D          │
 │ bot.ts      jogadores para os testes  │──────▶│   ├─ sfx.ts     sons             │
 │ upgrades.ts a loja e a economia       │       │   ├─ feed.ts    avisos           │
 │ calibrate.ts joga as fases com bots   │       │   └─ hud.tsx    painel e avisos  │
 │ pressures.ts tabela GERADA            │       │ App.tsx / Shop.tsx  menu e loja  │
 └───────────────────────────────────────┘       └──────────────────────────────────┘
        ▲  bun run calibrate (tools/calibrate.ts)
```

- A engine roda um tick a 30 Hz e não sabe que existe tela, som ou rede. O cliente chama `step` num laço de passo fixo e desenha o resultado interpolando entre os dois últimos estados.
- Não há servidor: o progresso (fase liberada, estrelas, moedas, melhorias) fica no `localStorage`.
- Os efeitos, os sons e os avisos saem da **diferença entre dois estados** (`tickEffects`, `playSounds`, `deriveFeed`), então a engine nunca os lê.

## packages/engine

TypeScript puro, sem dependências. Determinístico: o mesmo estado, a mesma entrada e a mesma semente dão o mesmo resultado.

| Arquivo | Conteúdo |
|---|---|
| `types.ts` | `GameState`, `Gate` (com `op` `add`/`mul`/`div` e `locked`), `Barrel`, `Enemy`, `Trap`, `Hazard`, `EventDef`, `LevelDef`, `Input`; listas `ENEMY_KINDS`, `WEAPON_KINDS`, `VEHICLE_KINDS`, `LEVEL_MODES`, `LEVEL_TWISTS` |
| `constants.ts` | Todo número ajustável: velocidades, alcance, dano das armas e dos veículos, vida e velocidade dos inimigos, tempos do chefão, do bombardeiro e das armadilhas |
| `game.ts` | `createGame`, `step`, `firstTarget` (quem leva o tiro), portais, barris, inimigos, chefão, armadilhas, bombardeio, `starsFor`, `columnXs`, `vehicleXs` |
| `levels.ts` | `campaignSpec(n)`, `generateLevel(spec)`, os modos (`gates`, `loot`, `mixed`), as características por fase, os padrões de portal, as hordas, as armadilhas e os eventos |
| `bot.ts` | `botInput(state, skill)`, `SKILLED_BOT`, `AVERAGE_BOT`, `IDLE` |
| `upgrades.ts` | As quatro melhorias, custos, `runPayout`, `expectedUpgrades(n)` |
| `calibrate.ts` | `measureSquad`, `settledTrace`, `calibratePressure`, `campaignLevel` |
| `pressures.ts` | Tabela gerada por `bun run calibrate`: pressão e traço do esquadrão de cada fase. **Não edite à mão** |
| `rng.ts` | mulberry32 (`nextRandom`, `randomSeed`) |

### Um tick (`step`)

1. O esquadrão desliza para o `target` ou para o `move` e fica dentro da pista (a largura depende do número de colunas).
2. Corre pela pista; **para a 14 unidades do chefão** enquanto ele vive.
3. Portais cruzados neste tick se aplicam (`add`, `mul` ou `div`). Em seguida as armadilhas (`crossTraps`) e os eventos (`stepEvents`: o avião marca as zonas de bomba).
4. Hordas que chegaram ao ponto de aparecer entram na pista.
5. **Tiro:** cada coluna de soldados atira no primeiro inimigo ou barril da sua faixa; se não houver, no portal (que não esteja `locked`). Cada veículo atira na sua faixa, mais larga. Tanque e helicóptero ignoram a armadura (`pierce`).
6. Quem ficou sem vida sai (`removeDead`; homem-bomba morto leva os vizinhos em cadeia); barris quebrados dão a recompensa; minas destruídas somem sem dano.
7. Cada inimigo age (`actEnemy`): anda, atira (atirador), explode (homem-bomba) ou, o chefão, marca a faixa que vai esmagar e chama lacaios.
8. As faixas marcadas contam o tempo e, ao zerar, tiram soldados das colunas que cobrem (`resolveHazards`).
9. Se o esquadrão chegou ao fim e não há chefão, vence; se acabaram os soldados, perde.

As perdas passam por `loseSoldiers`, que aplica a Resistência e acumula as frações que não dão um soldado inteiro.

### Como uma fase nasce

`campaignSpec(n)` decide modo, característica, mundo, dificuldade base, número de padrões (14 a 22), se há chefão e quantos bombardeios. `generateLevel(spec)` percorre a pista em padrões (portais, barris, hordas, armadilhas) e sempre abre com uma pequena horda a ~26 unidades.

O que é dimensionado **pelo esquadrão medido** (`spec.trace`) e não por um palpite do gerador:

- o tamanho das hordas (`fireAt`: quanto dano por segundo o esquadrão realmente tem ali);
- a vida dos barris;
- os números dos portais (`countAt`);
- quais inimigos já podem aparecer (um brutamonte só quando o esquadrão aguenta).

`pressure` multiplica a horda e a vida do chefão (a horda passa de 55 inimigos vira inimigos mais duros, não uma parede).

### Calibração e loja

`bun run calibrate` roda `calibratePressure(n)` para cada fase:

1. `settledTrace`: um bot bom joga a fase com as melhorias esperadas (`expectedUpgrades(n)`), registra soldados e dano por segundo a cada unidade de pista e **repete 3 vezes**, porque os portais dependem do traço e o traço dos portais.
2. Desce uma escada de pressões (16 até 0,2). A primeira em que o bot bom vence 4 de 5 é a candidata.
3. Da fase 3 em diante, se o mesmo bot **sem** melhorias ainda vence, sobe a pressão enquanto o bot com melhorias aguenta 3 de 5, até o de sem melhorias falhar.
4. As fases 1 e 2 ficam fáceis de propósito e dispensam a loja.

O resultado vai para `pressures.ts`. Um teste recalibra três fases e confere com a tabela.

## apps/web

### Telas

`App.tsx` alterna entre o menu (`Home`, com a legenda dos modos, o mapa e o aviso "você está atrás"), a loja (`screens/Shop.tsx`) e a partida (`game/Game.tsx`). `main.tsx` mostra a galeria no lugar do app quando a URL tem `?galeria=1`.

### Um quadro da partida (`Game.tsx`)

1. Lê a entrada (teclado ← → / A D, arrastar o dedo; depois de arrastar o esquadrão termina o deslize).
2. Acumula tempo e chama `step` a cada 33 ms, guardando o estado anterior (`prev`).
3. Para cada tick: `playSounds(prev, state)`, `deriveFeed(prev, state)` (avisos na tela) e `causeOfLoss` (o que derrubou o esquadrão, para o relatório).
4. `scene.render(prev, state, alpha, dt, time)` desenha interpolando entre os dois estados.
5. O HUD do React só atualiza quando algo visível muda (`sameHud`).

### A cena (`scene.ts`)

- Câmera alta, atrás do esquadrão, que recua um pouco quando ele fica fundo.
- Esquadrão: `formation.ts` (`squadFormation`) diz quantos soldados desenhar, de que tamanho e em quantas colunas. Pequeno, fica sobre as colunas de tiro, em tamanho cheio; grande, mantém a largura e limita a profundidade, com soldados menores e mais juntos. Abaixo de 90% do tamanho entra o soldado leve (uma segunda `Crowd`).
- Nitidez: `sharpness.ts` mede os quadros e muda os pixels por ponto do renderer (de 2 até 1) quando o aparelho não acompanha.
- Mundo: `scenery.ts` monta a ponte (torres, cabos, tirantes, água animada), as barreiras, o cenário de cada mundo, o horizonte e o clima (neve, brasas). `themes.ts` guarda as cores de cada mundo.
- Personagens: `figures.ts` descreve cada figura como uma lista de peças (`PartSpec`, cada uma com um papel: `static`, `legL`, `legR`, `armL`, `armR`, `gun`). `crowd.ts` junta as peças de mesma cor, cria uma `InstancedMesh` por cor e papel, desenha o contorno preto (a mesma peça virada do avesso e 14% maior) e anima pernas e braços em torno das juntas. Na partida as figuras vêm de `runSoldier`, `runGun` e `runEnemy`, que cortam as formas redondas pelo tamanho na tela (`cut`) e deixam de fora as peças marcadas com `skip`; a galeria usa as figuras inteiras.
- Efeitos: faíscas, clarões de cano, rastros luminosos (aditivos), bola de fogo com onda de choque e fumaça, tremor de câmera, poeira dos passos.
- Portais: pórtico de aço com placa pendurada e pintura de setas no asfalto; placa com cadeado quando travada.
- Perigos: espinhos, minas piscando, o avião cruzando o céu com sombra na pista, bombas caindo sobre as zonas vermelhas.

### Interface e som

- `hud.tsx`: painel (soldados, arma, veículos, melhorias ativas), contadores que rolam e avisos coloridos por tom. `feed.ts` deriva as mensagens da diferença entre dois estados.
- Relatório da fase: de onde veio cada moeda, quantos soldados sobraram e o que derrubou o esquadrão; o botão vai direto à loja quando a fase pede melhorias.
- `audio.ts` sintetiza tudo com Web Audio (tiros, acertos, portais, explosões, chefão, música do menu e da batalha) e `sfx.ts` escolhe os sons pela diferença entre estados. O botão de mudo fica salvo no navegador.

## Receitas

**Novo inimigo**
1. `ENEMY_KINDS` (`types.ts`) e `ENEMY_STATS` (`constants.ts`). Comportamento novo vai em `actEnemy` (`game.ts`).
2. `WORLD_ENEMIES` e os pesos em `addHorde` (`levels.ts`) dizem em que mundo ele entra e com que peso.
3. `bot.ts`: o que o bot bom faz diante dele (senão a calibração acha que é impossível).
4. A figura em `figures.ts` (`ENEMY_LOOKS`), o rótulo se aparecer em avisos e os sons.
5. `bun run calibrate`, `bun run test`, e olhar na galeria e no jogo.

**Novo chefão:** uma função em `figures.ts` que devolve um `FigureSpec` e uma entrada em `BOSS_FIGURES` (a ordem é a dos mundos); `BOSS_SCALE` para o tamanho.

**Nova arma ou veículo:** `WEAPON_KINDS`/`WEAPON_DPS` ou `VEHICLE_KINDS`/`VEHICLE_STATS`; o modelo em `figures.ts` (`weaponParts`) ou `vehicles.ts`; os rótulos em `names.ts`; as probabilidades em `pickReward`/`weaponFor`/`vehicleFor` (`levels.ts`).

**Novo perigo (armadilha ou evento)**
1. O tipo em `types.ts` (`Trap` ou `EventDef`) e os números em `constants.ts`.
2. A regra em `game.ts` (`crossTraps`, `stepEvents`) e o gerador em `levels.ts` (`addTraps` ou a lista `events`).
3. O desvio no `bot.ts` e a mensagem em `feed.ts`.
4. O modelo em `props.ts`, o desenho em `scene.ts`, o som em `audio.ts`/`sfx.ts`.
5. Testes em `game.test.ts` e `levels.test.ts`, depois `bun run calibrate`.

**Nova melhoria:** `UPGRADE_KINDS` e as constantes em `upgrades.ts`, o efeito em `createGame`/`loseSoldiers` (ou onde valer), o texto em `Shop.tsx` e o chip em `hud.tsx`. Decida se entra na compra "esperada" (`BUY_ORDER`).

**Novo mundo:** uma entrada em `THEMES` (`levels.ts`), `WORLD_ENEMIES`, um `ThemeLook` em `themes.ts`, o cenário em `scenery.ts` (`addWorld` e `addBackdrop`) e um chefão em `BOSS_FIGURES`; ajustar `MAP_LEVELS` em `App.tsx`.

## Instalação e offline

- `apps/web/public/manifest.webmanifest` e `public/icons` (gerados por `bun run icons`, a partir de `tools/make-icons.ts`) fazem o navegador oferecer a instalação; o `index.html` aponta para os dois.
- O `vite-plugin-pwa` (em `vite.config.ts`) gera `sw.js` no build de produção, com a lista de tudo o que o build produziu. O service worker guarda esses arquivos na primeira visita e passa a responder por eles, com ou sem rede. O servidor de desenvolvimento não tem service worker.
- Uma versão nova baixa em segundo plano, assume na hora e aparece na abertura seguinte. Nada recarrega a página sozinho.
- `vercel.json` diz à Vercel como montar o cliente (`bun install`, `bun run build`, saída em `apps/web/dist`).

## Verificação

- `bun run test`: regras, portais, armadilhas, bombardeio, inimigos, chefão, loja, geração de fases e equilíbrio (leva alguns segundos, com timeout explícito nos testes lentos).
- `bun run typecheck` e `bun run build`.
- PWA: `bun run build`, depois `cd apps/web && bunx vite preview --port 5185 --strictPort` e, num Chrome à parte, conferir que não há erro de instalação, recarregar sem rede e simular um deploy (mudar algo, gerar o build de novo e abrir duas vezes).
- No navegador: `?bot=1` deixa o bot jogar para você olhar uma fase; `?galeria=1` mostra os modelos de perto. Confira sempre do ângulo da câmera do jogo, em tamanho de celular.
