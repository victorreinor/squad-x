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
| `campaign.ts` | `playCampaign`: o teste de estresse. Um bot joga a campanha inteira como uma pessoa (guarda o que cada partida paga, compra na loja, tenta de novo ao perder) e diz quantas tentativas cada fase pediu e quanto duraram as lutas com chefão |
| `pressures.ts` | Tabela gerada por `bun run calibrate`: pressão e traço do esquadrão de cada fase. **Não edite à mão** |
| `rng.ts` | mulberry32 (`nextRandom`, `randomSeed`) |

### Um tick (`step`)

1. O esquadrão desliza para o `target` ou para o `move` e fica dentro da pista (a largura depende do número de colunas).
2. Corre pela pista; **para a 14 unidades do chefão** enquanto ele vive.
3. Portais cruzados neste tick se aplicam (`add`, `mul` ou `div`). Em seguida as armadilhas (`crossTraps`) e os eventos (`stepEvents`: o avião marca as zonas de bomba).
4. Hordas que chegaram ao ponto de aparecer entram na pista.
5. **Tiro:** cada coluna de soldados atira no primeiro inimigo, barril, mina, míssil ou barril explosivo da sua faixa; se não houver, no portal (que não esteja `locked`). Cada veículo atira na sua faixa, mais larga. Tanque e helicóptero ignoram a armadura (`pierce`). O escudo do Mecha fica com todo tiro que não vem pela brecha. Os soldados congelados pelo Yeti não atiram.
6. Quem ficou sem vida sai (`removeDead`; homem-bomba morto leva os vizinhos em cadeia); barris quebrados dão a recompensa; minas, mísseis e barris explosivos destruídos somem sem dano (`popped`). Se o chefão morreu, `endFight` apaga o que ele pôs em movimento.
7. Cada inimigo age (`actEnemy`): anda, atira (atirador), explode (homem-bomba) ou, o chefão, age em `actBoss` (abaixo).
8. Mísseis e barris explosivos andam e explodem nas colunas onde chegam (`moveProjectiles`); as faixas marcadas contam o tempo e, ao zerar, tiram soldados das colunas que cobrem, ou os congelam, no caso do gelo (`resolveHazards`); o fogo no chão queima quem está nele (`burnFires`); o gelo derrete.
9. Se o esquadrão chegou ao fim e não há chefão, vence; se acabaram os soldados, perde.

As perdas passam por `loseSoldiers`, que aplica a Resistência e acumula as frações que não dão um soldado inteiro.

### O chefão (`actBoss`)

O corpo do chefão é um `Enemy` (vida e posição, para levar tiro); o resto da luta fica em `state.bossFight` (`BossFight`). Quando o esquadrão chega a `BOSS_ACTIVE_RANGE`, a cada tick ele:

- chama os lacaios do seu mundo de `BOSS_SUMMON_INTERVAL` em `BOSS_SUMMON_INTERVAL` ticks, cada grupo `BOSS_SUMMON_GROWTH` vezes maior que o anterior (enrolar é perder);
- fica **furioso** abaixo de `BOSS_FURY_AT` da vida e passa a esperar menos entre os ataques (`BOSS_FURY_PACE`);
- ataca quando o ataque anterior acabou (nenhum míssil ou barril na pista, nenhuma faixa marcada) e o tempo de espera passou:

| Chefão | Ataque | Onde está a regra |
|---|---|---|
| General | Um míssil no lugar do esquadrão (três, furioso). Ele é alvo: as colunas embaixo dele o derrubam | `projectiles` (`kind: "missile"`), `moveProjectiles` |
| Senhor da Guerra | Fileira de barris explosivos rolando, com uma faixa livre. Protegem o chefão como um barril comum | `projectiles` (`kind: "keg"`) |
| Mecha | Escudo com uma brecha que muda de lugar (`gap`); o laser atira na brecha | `firstTarget` (escudo), faixa `laser` |
| Yeti | Gelo na faixa do esquadrão e, logo depois, a pancada (`next`) | faixas `ice` e `slam`, `state.chill` |
| Demônio | Meteoros em todos os lugares menos um (dois, ou três furioso); onde caem, a pista pega fogo | faixa `meteor`, `state.fires`, `burnFires` |

O que cada golpe fez no tick vai em `state.bossHits` (para efeitos, sons, avisos e o relatório); não há "último golpe" guardado.

As perdas passam por `loseSoldiers`, que aplica a Resistência e acumula as frações que não dão um soldado inteiro.

### Como uma fase nasce

`campaignSpec(n)` decide modo, característica, mundo, dificuldade base, número de padrões (14 a 22), se há chefão e quantos bombardeios. `generateLevel(spec)` percorre a pista em padrões (portais, barris, hordas, armadilhas) e sempre abre com uma pequena horda a ~26 unidades.

O que é dimensionado **pelo esquadrão medido** (`spec.trace`) e não por um palpite do gerador:

- o tamanho das hordas (`fireAt`: quanto dano por segundo o esquadrão realmente tem ali);
- a vida dos barris;
- os números dos portais (`countAt`);
- quais inimigos já podem aparecer (um brutamonte só quando o esquadrão aguenta).

`pressure` multiplica as hordas e os lacaios do chefão (a horda passa de 55 inimigos vira inimigos mais duros, não uma parede). A **vida do chefão não depende da pressão**: é o dano por segundo do esquadrão medido no momento em que o chefão acorda vezes `BOSS_FIGHT_SECONDS` (12 s; 18 s no chefão que fecha o mundo, `bossSeconds`) e vezes `BOSS_TOUGHNESS` (o Mecha tem 65%, porque o escudo já segura boa parte do tiro). Esse dano por segundo também fica em `level.boss.fire`, porque a vida dos mísseis e dos barris explosivos sai dele.

### Calibração e loja

`bun run calibrate` roda `calibratePressure(n)` para cada fase:

1. `settledTrace`: um bot bom joga a fase com as melhorias esperadas (`expectedUpgrades(n)`) três vezes e registra soldados e dano por segundo a cada unidade de pista; o traço é a **mediana** das três (uma partida desastrosa não dimensiona a fase). A medição **se repete 4 vezes**, porque os portais dependem do traço e o traço dos portais.
2. Desce uma escada de pressões (16 até ~0,1). A primeira em que o bot bom vence `WIN_SHARE` das 8 partidas (4 de 8; 3 de 8 no chefão que fecha o mundo; 6 de 8 nas fases 1 e 2) é a candidata.
3. Da fase 3 em diante, se o mesmo bot **sem** melhorias ainda vence 4 de 8, sobe a pressão enquanto o bot com melhorias aguenta um pouco menos, até o de sem melhorias falhar.
4. As fases 1 e 2 ficam fáceis de propósito e dispensam a loja.

`expectedUpgrades(n)` é o jogador para quem tudo isso é afinado: vence cada fase uma vez com duas estrelas e, da fase 3 em diante, vence de novo uma fase anterior antes de cada nova, gastando tudo na loja. A economia é a de `runPayout`: derrota não paga; a primeira vitória numa fase paga recompensa, estrelas e saque; vencer de novo paga 50%, 25% e depois nada (`REPLAY_SHARES`); estrela nova paga `STAR_COINS` sempre. O progresso guarda quantas vezes cada fase foi vencida (`wins`) e a melhor marca (`stars`). `bun run stress` confere o resultado jogando a campanha inteira, inclusive as voltas a fases antigas de quem trava.

O resultado vai para `pressures.ts`. Um teste recalibra três fases e confere com a tabela.

## apps/web

### Telas

`App.tsx` alterna entre o menu (`Home`, com a legenda dos modos, o mapa e o aviso "você está atrás"), a loja (`screens/Shop.tsx`) e a partida (`game/Game.tsx`). `main.tsx` mostra a galeria no lugar do app quando a URL tem `?galeria=1`, e a arena dos chefões (`BossArena.tsx`) quando tem `?chefao=`.

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

- `hud.tsx`: painel (soldados, arma, veículos, melhorias ativas), contadores que rolam, avisos coloridos por tom (a mesma notícia repetida conta "×2" na mesma linha em vez de empilhar) e a barra de vida do chefão (`BossBar`), que toma o lugar da barra de progresso quando ele está a menos de `BOSS_IN_SIGHT` unidades, com a marca da fúria. O aviso grande ("SAIA DA FAIXA!", "SAIA DO FOGO!", "CONGELADOS!") fica entre o painel e as mensagens, empurrando-as em vez de cobri-las. `feed.ts` deriva as mensagens da diferença entre dois estados, inclusive a apresentação de cada chefão quando ele acorda (`BOSS_INTRO`).
- Relatório da fase: de onde veio cada moeda, quantos soldados sobraram e o que derrubou o esquadrão; o botão vai direto à loja quando a fase pede melhorias.
- `audio.ts` sintetiza tudo com Web Audio, sem arquivo nenhum. Cada efeito é feito de camadas, como uma gravação: um estalo de ruído (`hiss`), um corpo de ruído filtrado, um tranco grave (`voice`) e uma cauda que vai para um eco de sala (`roomImpulse`, uma resposta de sala feita de ruído). Cada efeito varia um pouco a cada vez (`vary`) e sai do lado da pista onde acontece (`place`, com `pan`). Um compressor e um limitador suave no fim seguram o volume quando muita coisa toca junto. A música são três trilhas num sequenciador de semicolcheias: menu (acordes e dedilhado), fase (bateria, baixo, melodia) e chefão (ostinato grave, metais, viradas de tons), com a camada pesada da fúria (`setFury`). A troca de trilha faz um *fade* de 0,45 s. `sfx.ts` escolhe sons e música pela diferença entre estados: a música do chefão entra quando ele acorda e sai quando ele cai. O botão de mudo fica salvo no navegador.

## Receitas

**Novo inimigo**
1. `ENEMY_KINDS` (`types.ts`) e `ENEMY_STATS` (`constants.ts`). Comportamento novo vai em `actEnemy` (`game.ts`).
2. `WORLD_ENEMIES` e os pesos em `addHorde` (`levels.ts`) dizem em que mundo ele entra e com que peso.
3. `bot.ts`: o que o bot bom faz diante dele (senão a calibração acha que é impossível).
4. A figura em `figures.ts` (`ENEMY_LOOKS`), o rótulo se aparecer em avisos e os sons.
5. `bun run calibrate`, `bun run test`, e olhar na galeria e no jogo.

A arena dos chefões (`?chefao=yeti`, `BossArena.tsx`) joga `bossArena(kind)` (`levels.ts`): uma pista curta direto ao chefão, com 40 soldados de submetralhadora. O `Game` aceita essa fase pronta em `def` e, nesse caso, não mostra o relatório: a arena recomeça a luta sozinha.

**Novo chefão**
1. Uma entrada em `BOSS_KINDS` (`types.ts`, na ordem dos mundos), os números dele em `constants.ts` (`BOSS_ATTACK_INTERVAL`, `BOSS_MINIONS`, `BOSS_TOUGHNESS` e os do ataque).
2. O ataque em `actBoss` (`game.ts`). Se ele deixa algo na pista, use o que já existe: uma faixa marcada (`mark`), um projétil (`projectiles`) ou fogo (`fires`). Todo ataque precisa de aviso e de um jeito de sair.
3. O desvio no `bot.ts` (as faixas e os projéteis já entram em `dodge`), senão a calibração mede "o bot que não desvia".
4. A figura em `figures.ts` (`BOSS_FIGURES`) e o nome em `BOSS_NAME` (`names.ts`). O desenho do que ele lança em `props.ts` e `scene.ts` (`drawBossWork`, `MARK_LOOK`), a apresentação e as mensagens em `feed.ts` (`BOSS_INTRO`, `BLOW`), os sons em `audio.ts` e `sfx.ts`.
5. Testes em `bosses.test.ts`, depois `bun run calibrate` só das fases de chefão e `bun run stress`.

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
- O progresso fica no `localStorage` com uma versão (`SAVE_VERSION` em `progress.ts`). Subir esse número apaga o progresso de todo mundo na primeira vez que a versão nova abrir, e o menu avisa uma vez. A preferência de som fica guardada à parte e não é apagada.
- `vercel.json` diz à Vercel como montar o cliente (`bun install`, `bun run build`, saída em `apps/web/dist`).

## Verificação

- `bun run test`: regras, portais, armadilhas, bombardeio, inimigos, cada chefão, loja, geração de fases, equilíbrio e a campanha inteira jogada por bots (leva alguns segundos, com timeout explícito nos testes lentos).
- `bun run stress`: o teste de estresse em detalhe. O bot bom e o médio jogam a campanha do começo comprando na loja e repetindo fases, e o relatório mostra, fase a fase, as tentativas, as estrelas, as melhorias e a duração das lutas com chefão. `bun run stress 3` joga três campanhas de cada.
- `bun run typecheck` e `bun run build`.
- PWA: `bun run build`, depois `cd apps/web && bunx vite preview --port 5185 --strictPort` e, num Chrome à parte, conferir que não há erro de instalação, recarregar sem rede e simular um deploy (mudar algo, gerar o build de novo e abrir duas vezes).
- No navegador: `?bot=1` deixa o bot jogar para você olhar uma fase; `?galeria=1` mostra os modelos de perto. Confira sempre do ângulo da câmera do jogo, em tamanho de celular.
