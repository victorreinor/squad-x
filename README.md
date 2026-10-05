<p align="center">
  <img src=".github/readme/banner.png" alt="Squad X: o esquadrão de soldados de costas e a horda de inimigos à frente" width="100%">
</p>

<p align="center">
  <b>Um esquadrão, uma pista e muita gente querendo te parar.</b><br>
  Corra, atire sozinho, escolha o portal certo e segure a horda até o chefão. Jogo de celular em 3D, direto no navegador.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/Three.js-3D-000000?logo=threedotjs&logoColor=white" alt="Three.js">
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" alt="Vite 7">
  <img src="https://img.shields.io/badge/Bun-workspaces-000000?logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/testes-81-2ea44f" alt="81 testes">
  <img src="https://img.shields.io/badge/arte-100%25%20por%20c%C3%B3digo-ffb62e" alt="Arte 100% por código">
  <img src="https://img.shields.io/badge/custo-R%24%200%2Fm%C3%AAs-2ea44f" alt="Custo: R$ 0 por mês">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-PolyForm%20Strict-6e7781" alt="Licença: PolyForm Strict"></a>
</p>

<p align="center">
  <img src=".github/readme/gameplay.gif" width="270" alt="O esquadrão passando por um portal +22 no deserto, com a horda logo à frente">
  <br>
  <sub>Gravado no jogo: um bot jogando a fase 12 (deserto). Repare no <code>+22</code> azul à esquerda e no <code>-16</code> vermelho com cadeado à direita.</sub>
</p>

## 🪖 Que jogo é esse?

Sabe aquele anúncio de celular em que um soldadinho corre por uma ponte, passa por um portal `×4` e vira um exército? Aqui ele é um jogo de verdade, e com as decisões que o anúncio nunca mostra.

Você arrasta o dedo para mover o esquadrão. Ele atira sozinho. O resto é escolher: qual portal tomar, qual barril abrir primeiro, para onde desviar quando o avião marca a pista com vermelho, e quanto do dinheiro gastar na loja antes da próxima fase.

Tudo é original: cada soldado, monstro, arma e som sai de código. Nenhum modelo ou arquivo de áudio foi copiado.

## 🚪 O que tem na pista

- **Portais:** `+N` e `×N` ajudam, `-N` e `÷N` machucam. Os vermelhos com cadeado não dá para consertar a tiros; só existe um tipo de vermelho "bombeável", e só vale a pena com poder de fogo de sobra.
- **Barris:** quebram em arma nova, veículo, soldados ou moedas. O barril na sua frente recebe o tiro até quebrar, então a ordem importa.
- **Hordas:** zumbis, velocistas, brutamontes, policiais de choque (o tiro de soldado rende menos neles), homens-bomba (explodem em cadeia) e atiradores (recuam e atiram).
- **Chefões:** cinco, um por mundo. Ficam parados na pista, visíveis de longe, e marcam no chão a faixa que vão esmagar. Quem não sai dela perde soldados.
- **Perigos:** espinhos para desviar, minas para atirar de longe e, a partir da fase 6, um **bombardeiro** que deixa um corredor seguro entre as zonas vermelhas.
- **Loja:** Dano, Reforços, Resistência e Butim. A campanha inteira é calibrada em volta dela (veja [Dificuldade](#-dificuldade-amarrada-à-loja)).

## 👥 O elenco

### O esquadrão

Visto de costas, que é como você o enxerga no jogo: capacete grande com aba, colete com placas, mochila com rolo de dormir, pá e cantil. Até 126 aparecem na tela; o número em cima do grupo mostra o total real.

<p align="center">
  <img src=".github/readme/soldado.png" alt="O soldado de costas e de frente, com pistola, fuzil, submetralhadora e minigun" width="100%">
</p>

### A horda

Cada tipo tem rosto, silhueta e jeito de correr próprios, e só entra numa fase quando o esquadrão esperado aguenta enfrentá-lo.

<p align="center">
  <img src=".github/readme/inimigos.png" alt="Zumbi, velocista, brutamonte, policial de choque, homem-bomba e atirador" width="100%">
</p>

| Inimigo | Chega no mundo | Vida | Como é |
|---|---|---|---|
| Zumbi | 1 | 6 | Corre em bando, camisa rasgada |
| Velocista | 2 | 4 | O dobro da velocidade do zumbi |
| Brutamonte | 1 | 40 | Porrete e ombreiras de espinhos; leva 4 soldados ao encostar |
| Policial de choque | 2 | 34 | Escudo: soldados rendem 45%. Tanque e helicóptero ignoram |
| Homem-bomba | 3 | 9 | Dinamite no peito; morto de longe, leva os vizinhos junto |
| Atirador | 4 | 14 | Para a 16 unidades, atira a cada 1,3 s e recua se você chega perto |

### Os chefões

<p align="center">
  <img src=".github/readme/chefoes.png" alt="O General, o Senhor da Guerra, o Mecha, o Yeti e o Demônio" width="100%">
</p>

O **General** (ponte), o **Senhor da Guerra** (deserto), o **Mecha** (cidade), o **Yeti** (neve) e o **Demônio** (vulcão), nas fases 5 e 10 de cada mundo. O esquadrão para a 14 unidades deles e só segue quando morrem. Eles esmagam a pista (aviso de 1,1 s) e chamam lacaios.

### Armas e veículos

<p align="center">
  <img src=".github/readme/armas.png" alt="Pistola, fuzil, submetralhadora e minigun" width="100%">
</p>

Uma arma melhor troca a de **todos** os soldados. Os veículos correm ao lado do esquadrão, até quatro, cada um com um soldado dentro, e atiram na própria faixa mesmo que só reste um soldado.

<p align="center">
  <img src=".github/readme/veiculos.png" alt="Moto, helicóptero e tanque" width="100%">
</p>

### Perigos

<p align="center">
  <img src=".github/readme/perigos.png" alt="Espinhos, mina, bombardeiro e bomba" width="100%">
</p>

| Perigo | Como evitar | Custo se pegar |
|---|---|---|
| Espinhos | Mudar de faixa (não dá para atirar) | 40% dos soldados nas colunas sobre eles |
| Mina | Atirar de longe (14 de vida) ou desviar | 60% dos soldados num raio de 1,7 |
| Bombardeiro | Ficar no corredor sem vermelho; 1,6 s de aviso | 55% dos soldados dentro de cada bomba |

Esquadrão pequeno desvia melhor; esquadrão grande aguenta mais. Cada colisão tira uma fração dos soldados das **colunas** atingidas, não de todos.

## 🌍 Cinco mundos, cinquenta fases

<p align="center">
  <img src=".github/readme/mundos.jpg" alt="Ponte, deserto, cidade, neve e vulcão" width="100%">
  <br>
  <sub>Ponte pênsil com água animada, deserto de cactos, cidade de janelas acesas, neve caindo na frente da câmera e vulcão com brasas.</sub>
</p>

Cada mundo tem dez fases, com um chefão na 5 e na 10. As fases alternam entre **Portais**, **Barris** e **Misto**, e cada uma tem uma característica própria: Enxame, Elite, Emboscada, Escassez, Correria ou Armadilhas. O aviso aparece ao começar. Cada fase leva de uns 45 a 75 segundos de pista.

## 🎚️ Dificuldade amarrada à loja

O jogo é feito para quem **evolui**: passa a fase 1 e a 2, trava na 3 até comprar algo, e o chefão do fim exige ainda mais.

- Um jogador "típico" (duas estrelas por fase, gastando tudo na loja) define o que cada fase espera do esquadrão.
- Cada fase é calibrada **jogando-a com bots** para ser a mais difícil que ainda é vencível com o que esse jogador comprou, e, da fase 3 em diante, **não** vencível sem a loja.
- Os números medidos nas 30 primeiras fases: com a loja esperada, o bot bom vence ~78% (e perde soldados em 95% das vitórias); sem a loja, ~7%; o bot que não se mexe, ~3%.

<p align="center">
  <img src=".github/readme/telas.jpg" alt="Menu, loja, bombardeio, chefão e relatório da fase" width="100%">
  <br>
  <sub>Menu avisando que você está atrás para a fase 7 · loja · bombardeio · o General esmagando a pista · relatório da fase.</sub>
</p>

A tela sempre diz o que você tem (soldados, arma, veículos, melhorias) e o que acabou de acontecer (portal, barril, armadilha, bomba), e o relatório da fase mostra de onde veio cada moeda e o que derrubou o esquadrão.

## ⚙️ Por dentro

| Camada | O que usa |
|---|---|
| Linguagem | TypeScript `strict` e ESM, num monorepo de Bun workspaces |
| Regras do jogo | `packages/engine`: TypeScript puro e determinístico, sem DOM |
| Cliente | React 19 + Vite 7 para as telas e o HUD; a partida é desenhada em Three.js |
| Arte | Montada por código a partir de formas simples, com sombreamento "toon" e contorno preto |
| Som | Sintetizado em tempo real com Web Audio, sem nenhum arquivo de áudio |
| Fases | Geradas por semente e calibradas por simulação (`bun run calibrate`) |
| Testes | `bun test`: 81 testes, incluindo o equilíbrio das fases com e sem loja |

```mermaid
flowchart LR
  subgraph engine["packages/engine (puro)"]
    gen["gerador de fases<br/>por semente"]
    cal["calibração<br/>com bots"]
    step["step: um tick a 30 Hz"]
  end
  tab[("pressures.ts<br/>(tabela gerada)")]
  subgraph web["apps/web"]
    ui["React: menu, loja, HUD"]
    scene["Three.js: a pista"]
    fx["som, efeitos e avisos"]
  end
  cal -- "bun run calibrate" --> tab
  tab --> gen
  gen --> step
  step -- "estado" --> scene
  step -- "diferença entre dois estados" --> fx
  ui --> step
```

Algumas escolhas que fazem diferença:

- **A engine não conhece o desenho.** Sons, partículas, tremor e os avisos na tela saem da diferença entre dois estados. Trocar o visual não mexe nas regras nem nos testes.
- **Determinismo.** Nada de `Math.random()` nas regras: o acaso vem de um gerador com semente, então todo bug vira um teste que se repete.
- **Muitos bonecos, poucas chamadas de desenho.** Centenas de soldados e inimigos saem de `InstancedMesh`, com as peças de mesma cor fundidas e um contorno por trás.
- **Fase dimensionada pelo esquadrão medido.** Um bot joga a fase, e o quanto o esquadrão cresce a cada metro da pista dimensiona hordas, barris e números dos portais. Antes o gerador chutava, e errava por muito.
- **Nada de simulação no celular.** O resultado da calibração fica numa tabela gerada.

Detalhes em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (como funciona), [docs/DECISIONS.md](docs/DECISIONS.md) (por quê) e [docs/ROADMAP.md](docs/ROADMAP.md) (o que vem por aí). A folha de referência visual de todos os personagens e telas está em [docs/design-system.html](docs/design-system.html): baixe e abra no navegador.

## 🕹️ Controles

| Ação | Teclado | Celular |
|---|---|---|
| Mover o esquadrão | ← → ou A D | arrastar o dedo |
| Som ligado/desligado | botão 🔊 | botão 🔊 |
| Sair da fase | botão ✕ | botão ✕ |

O esquadrão atira sozinho, e depois de arrastar ele termina o deslize até onde você soltou.

## 🛠️ Rodar localmente

Precisa de [Bun](https://bun.sh) e do Node do `.nvmrc`.

```bash
bun install
bun run dev      # Vite em http://localhost:5183
```

**No celular:** com o computador e o celular na mesma rede Wi-Fi, abra `http://<IP do computador>:5183` no navegador do celular. O IP sai de `ipconfig getifaddr en0` (no Mac). `localhost` no celular é o próprio celular. O Vite já escuta na rede.

Atalhos na URL para testar:

- `?bot=1`: o bot da engine joga a fase sozinho (aparece o selo 🤖 BOT);
- `?galeria=1`: a galeria dos modelos (soldado, inimigos, chefões, armas, veículos, perigos); arraste para girar.

| Comando | O que faz |
|---|---|
| `bun run test` | Testes da engine, incluindo o equilíbrio das fases |
| `bun run typecheck` | Checagem de tipos da engine e do cliente |
| `bun run build` | Build de produção do cliente |
| `bun run calibrate` | Joga as 50 fases com bots e regrava a tabela de dificuldade |

Mexeu em regra, gerador, bot ou loja? Rode `bun run calibrate` e depois `bun run test`.

## 📁 Estrutura

- `packages/engine`: regras, gerador de fases, bots, loja e calibração
- `apps/web`: cliente em React + Three.js (cena, personagens, cenários, interface, som)
- `tools`: o script de calibração
- `docs`: arquitetura, decisões, roadmap e a folha de referência visual

Vai trabalhar no código com um agente de IA? As instruções estão em [CLAUDE.md](CLAUDE.md) (o [AGENTS.md](AGENTS.md) aponta para ele).

## 📜 Licença

O código está à mostra, mas não é open source. A licença é a [PolyForm Strict 1.0.0](https://polyformproject.org/licenses/strict/1.0.0), com uma permissão a mais para pull requests.

- ✅ **Pode:** ler o código, abrir [issues](https://github.com/victorreinor/squad-x/issues) com bugs e ideias, sugerir melhorias por pull request, rodar na sua máquina para uso pessoal (estudar, testar, se divertir), sem fins comerciais.
- ❌ **Não pode:** vender ou usar comercialmente, colocar o jogo online para outras pessoas, redistribuir cópias, criar versões modificadas (fora os pull requests para cá) nem reaproveitar código, arte ou sons em outro projeto.

Os termos completos estão em [LICENSE](LICENSE). Quer usar para outra coisa? Abra uma issue e pergunte.

<p align="center">
  <img src=".github/readme/chefoes.png" height="120" alt="Os cinco chefões">
  <br>
  <sub>Nenhum chefão se feriu na produção deste jogo. Quer dizer, só os que levaram um tanque na cara.</sub>
</p>
