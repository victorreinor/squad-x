# Roadmap

Legenda: `[x]` feito · `[ ]` pendente. Atualizar a cada entrega.
Tamanho: P pequeno · M médio · G grande. 🎚️ = mexe nas regras, no gerador ou no bot: rodar `bun run calibrate` e `bun run test`.

## Próximos passos (em ordem de prioridade)

**Primeiro: validar no celular**
- [ ] Jogar de verdade no celular (Wi-Fi + `http://<IP>:5183`): arrastar, tamanho dos soldados e dos números, desempenho com centenas de bonecos, leitura dos avisos — P
- [ ] Medir os quadros por segundo num celular de verdade, com esquadrão cheio e horda na tela: as contas de triângulos foram feitas no Mac, e é o celular que diz se bastou — P
- [ ] Inimigos distantes mais leves: a horda nasce a 42 unidades, onde cada inimigo tem poucos pixels, mas é desenhada com o boneco inteiro (~2 a 4,6 mil triângulos cada). Hoje o pico de uma partida (~470 mil) é uma horda longe. Dá para usar a mesma ideia do soldado leve, escolhendo pela distância — M
- [ ] Ajustar o que o teste no celular mostrar (câmera, sensibilidade do arrastar, tamanho do HUD) — M
- [ ] Fase 1 mais gentil para quem erra portais: hoje só o bot "médio" perde nela — P 🎚️
- [ ] Ouvir o som de verdade (hoje só confirmamos por contagem que dispara) e ajustar volume e timbre — P

**Depois: o jogo**
- [ ] Armas com efeito de verdade (cadência, perfuração, área) em vez de só dano por segundo — M 🎚️
- [ ] Um comportamento próprio por chefão (o Yeti congela faixas, o Mecha atira nos lados, o Demônio chama fogo no chão) — M 🎚️
- [ ] Mais eventos, como o bombardeiro: tempestade, meteoros, ponte que cede — M 🎚️
- [ ] Modo **Defesa** (esquadrão parado, ondas, três cartas entre as ondas) e modo **Infinito** (sem fim, por pontuação) no mapa — G 🎚️
- [ ] Dificuldades Difícil e Pesadelo por mundo, liberadas ao terminar o mundo — M 🎚️
- [ ] Mais melhorias e uma segunda moeda (por exemplo, por chefão) para não esvaziar a loja nas últimas fases — M 🎚️

**Depois: acabamento**
- [ ] Veículos mais vivos: rodas e esteiras girando, hélice com borrão, fumaça do escapamento — P
- [ ] Soldado em poses diferentes (comemorando, caindo) para a tela de resultado — P
- [ ] Dividir o bundle: o Three.js passa de 700 kB e o total de 1 MB (a tabela de calibração pesa ~190 kB). Cuidado com o service worker: com pedaços carregados depois, a página que ainda roda a versão antiga pode pedir um arquivo que a nova já apagou (veja `DECISIONS.md`) — P
- [ ] Empacotar para a Play Store, quando o jogo estiver bom — G

**Quando der: proteção e publicação**
- [ ] CI no GitHub Actions: typecheck, testes e build a cada push — P
- [ ] Publicar o cliente: importar o repositório na Vercel (free tier; o `vercel.json` já está pronto) e pôr o endereço no README e no `CLAUDE.md` — P
- [ ] Conferir no celular, já pelo endereço publicado (precisa de HTTPS): instalar na tela inicial, abrir em modo avião e receber uma versão nova — P
- [ ] Aviso de erros em produção (Sentry ou similar, plano grátis; conferir os limites antes) — P

## Feito

**Fundação**
- [x] Monorepo (Bun workspaces), engine pura e determinística, cliente React + Three.js
- [x] Esquadrão que corre, atira em colunas e cresce ou encolhe com os portais
- [x] Progresso no navegador: fase liberada, estrelas (1 a 3), moedas e melhorias
- [x] Mapa de 50 fases em 5 mundos; arrastar o dedo ou ← → / A D; abrir no celular pela rede (`host: true`)

**Pista**
- [x] Portais `+N`, `×N`, `-N` e `÷N`; portais vermelhos **travados** (cadeado) que atirar não conserta; só o "bombeável" pode ser virado, e a um custo crescente
- [x] Dilemas de portal: soma contra multiplicação, o vermelho grande que dá para virar, os dois lados ruins
- [x] Barris com vida proporcional ao poder de fogo, que soltam arma, veículo, soldados ou moedas; o barril na faixa protege quem está atrás
- [x] Veículos (moto, helicóptero e tanque) ao lado do esquadrão, com tiro próprio, até 4
- [x] Inimigos: zumbi, velocista, brutamonte, policial de choque (armadura), homem-bomba (explode em cadeia) e atirador (recua e atira)
- [x] Chefão por mundo, parado na pista, visível de longe: bloqueia o avanço, marca a faixa que vai esmagar (aviso de 1,1 s) e chama lacaios; a linha de chegada fica depois dele
- [x] Armadilhas: espinhos (desviar) e minas (atirar de longe ou desviar)
- [x] Bombardeiro a partir da fase 6: avião, zonas vermelhas com aviso e corredor seguro
- [x] Modos de fase (Portais, Barris, Misto) e características (Enxame, Elite, Emboscada, Escassez, Correria, Armadilhas)

**Loja e dificuldade**
- [x] Quatro melhorias (Dano, Reforços, Resistência, Butim) e recompensa por fase
- [x] A campanha é calibrada em volta da loja: fases 1 e 2 sem comprar nada; da 3 em diante o bot bom sem melhorias perde, e com o esperado vence cerca de 78% perdendo soldados no caminho
- [x] Fase dimensionada pelo esquadrão medido por um bot, não por palpite (`SquadTrace`), com a medição repetida até estabilizar
- [x] Calibração por simulação (`bun run calibrate`) com tabela gerada (`pressures.ts`), para o jogo não simular nada no celular
- [x] Três bots (bom, médio, parado) e testes de equilíbrio com e sem loja (81 testes)

**Visual e som**
- [x] Personagens montados por peças com contorno: soldado, seis inimigos, cinco chefões, quatro armas, três veículos, espinhos, mina, avião e bomba
- [x] Cenário próprio em cada mundo: ponte pênsil com água animada, deserto, cidade, neve e vulcão, com horizonte e clima
- [x] Efeitos: clarão no cano, rastro luminoso, bola de fogo com onda de choque, fumaça, poeira e tremor de câmera
- [x] Som sintetizado (tiros, acertos, portais, barris, veículos, explosões, chefão, bombardeio, música do menu e da batalha) e botão de mudo
- [x] Galeria `?galeria=1` para ver os modelos de perto e do ângulo do jogo

**Desempenho**
- [x] Esquadrão que encolhe para caber: a largura é a das colunas de tiro e a profundidade para em 4 unidades, então de ~50 soldados em diante os bonecos diminuem e as fileiras se apertam. O bloco ocupa o mesmo pedaço da tela com 54 ou com 999, e a pista à frente fica à vista. Antes eram 126 bonecos em tamanho cheio cobrindo a metade de baixo, em 29 das 50 fases
- [x] Bonecos cortados pelo tamanho na tela: o soldado foi de ~7,6 mil triângulos para ~3,7 mil na partida e ~1,1 mil quando o esquadrão é grande; os inimigos, para cerca da metade. Na mesma cena, o quadro com 126 soldados caiu de ~1 milhão de triângulos para ~157 mil (com 999: ~234 mil). A galeria continua com o corte original
- [x] Resolução adaptável: se os quadros demoram, a imagem fica um degrau mais suave (de 2 até 1 pixel por ponto, em três degraus) e volta quando sobra folga; um tranco passageiro se desfaz em ~13 s
- [x] Multidão vazia não envia nada à placa de vídeo, e a cheia envia só o que usou

**Interface**
- [x] Painel do que você tem (soldados, arma, veículos, melhorias), avisos coloridos do que aconteceu e contadores que rolam
- [x] Relatório da fase com a origem de cada moeda e o que derrubou o esquadrão; botão direto para a loja quando a fase pede melhorias
- [x] Aviso no menu quando o jogador está atrás do esperado para a próxima fase
- [x] Telas com transição, botões com resposta e tudo respeitando `prefers-reduced-motion`

**Instalação e publicação**
- [x] PWA instalável: manifesto, ícones desenhados por código (`bun run icons`), tela cheia e em pé
- [x] Joga sem internet depois da primeira visita: o service worker guarda o jogo inteiro (~1,1 MB); a versão nova baixa em segundo plano e entra na abertura seguinte, sem recarregar a página no meio de uma fase
- [x] `vercel.json` para a Vercel montar o cliente (o mesmo esquema do Bomb Arena, sem servidor)

**Documentação e licença**
- [x] Licença PolyForm Strict 1.0.0, com permissão extra para pull requests (a mesma do Bomb Arena)
- [x] README com banner, GIF, prints dos personagens, mundos e telas; CLAUDE.md e AGENTS.md para agentes de IA; ARCHITECTURE, DECISIONS e esta lista
- [x] Folha de referência visual `docs/design-system.html` (também como artifact do Claude)
