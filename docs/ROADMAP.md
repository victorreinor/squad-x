# Roadmap

Legenda: `[x]` feito · `[ ]` pendente. Atualizar a cada entrega.
Tamanho: P pequeno · M médio · G grande. 🎚️ = mexe nas regras, no gerador ou no bot: rodar `bun run calibrate` e `bun run test`.

## Próximos passos (em ordem de prioridade)

**Primeiro: validar no celular**
- [ ] Jogar de verdade no celular (Wi-Fi + `http://<IP>:5183`): arrastar, tamanho dos soldados e dos números, desempenho com centenas de bonecos, leitura dos avisos — P
- [ ] Medir os quadros por segundo num celular de verdade, com esquadrão cheio e horda na tela: as contas de triângulos foram feitas no Mac, e é o celular que diz se bastou — P
- [ ] Inimigos distantes mais leves: a horda nasce a 42 unidades, onde cada inimigo tem poucos pixels, mas é desenhada com o boneco inteiro (~2 a 4,6 mil triângulos cada). Hoje o pico de uma partida (~470 mil) é uma horda longe. Dá para usar a mesma ideia do soldado leve, escolhendo pela distância — M
- [ ] Ajustar o que o teste no celular mostrar (câmera, sensibilidade do arrastar, tamanho do HUD) — M
- [ ] Fase 1 mais gentil para quem erra portais: o bot "médio" leva de 9 a 17 tentativas nela, e como a derrota não paga, quem trava na fase 1 não tem como juntar moedas — P 🎚️
- [ ] Ouvir o som novo no celular e ajustar volume e timbre (os níveis foram acertados medindo arquivos gravados do motor de som: tiros a ~−18 dB de pico, música a ~−10 dB, explosões a ~−5 dB) — P

**Depois: o jogo**
- [ ] Armas com efeito de verdade (cadência, perfuração, área) em vez de só dano por segundo — M 🎚️
- [ ] Algumas fases de "Correria" e "Enxame" (8, 22, 38, 39, 44, 46) calibram no teto da pressão (16): nelas a pressão quase não muda o resultado, porque quem decide são os portais. Dá para dar ao gerador outra alavanca nessas fases (mais portais ruins, menos tempo entre eles) — M 🎚️
- [ ] A fase mais dura do jogador bom no teste de estresse ainda varia muito de uma campanha para outra (de 9 a 19 tentativas): vale olhar as fases que passam de 15 — P 🎚️
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
- [x] Chefão por mundo, parado na pista, visível de longe: bloqueia o avanço e chama lacaios; a linha de chegada fica depois dele
- [x] Um ataque próprio por chefão: General (mísseis que dá para derrubar), Senhor da Guerra (barris explosivos rolando com uma faixa livre), Mecha (escudo com brecha e laser na brecha), Yeti (gelo que congela e pancada logo depois) e Demônio (meteoros e fogo no chão). Todo ataque é avisado e tem saída; o bot sabe enfrentar cada um
- [x] Fúria abaixo de metade da vida (ataques mais rápidos, aura vermelha, marca na barra) e lacaios do próprio mundo em ondas 30% maiores a cada vez
- [x] Vida do chefão em segundos de tiro do esquadrão esperado (12 s, 18 s no último do mundo; o Mecha 65%), sem depender da pressão. Antes as lutas iam de 4 s a 14 minutos e o chefão da fase 25 tinha 28 de vida; agora a mediana vai de 10 a 55 s
- [x] Câmera que olha mais à frente na luta, para o chefão não ficar atrás do painel
- [x] Míssil e barril explosivo com a vida do esquadrão de agora (antes os mísseis eram todos derrubados e os barris levavam 2 ou 3 soldados), míssil mais rápido, número de vida no barril explosivo e o barril rolando sobre o eixo (antes afundava na pista)
- [x] Rastro do tiro âmbar, desenhado por cima da pista: o amarelo-claro somado virava branco na ponte
- [x] Arena dos chefões (`?chefao=yeti`): uma luta curta direto com o chefão escolhido, que recomeça sozinha, com barra para trocar de chefão e de quem joga
- [x] Armadilhas: espinhos (desviar) e minas (atirar de longe ou desviar)
- [x] Bombardeiro a partir da fase 6: avião, zonas vermelhas com aviso e corredor seguro
- [x] Modos de fase (Portais, Barris, Misto) e características (Enxame, Elite, Emboscada, Escassez, Correria, Armadilhas)

**Loja e dificuldade**
- [x] Quatro melhorias (Dano, Reforços, Resistência, Butim) e recompensa por fase
- [x] A campanha é calibrada em volta da loja: fases 1 e 2 sem comprar nada; da 3 em diante o bot bom sem melhorias perde, e com o esperado vence cerca de 78% perdendo soldados no caminho
- [x] Fase dimensionada pelo esquadrão medido por um bot, não por palpite (`SquadTrace`), com a medição repetida até estabilizar
- [x] Calibração por simulação (`bun run calibrate`) com tabela gerada (`pressures.ts`), para o jogo não simular nada no celular
- [x] Três bots (bom, médio, parado) e testes de equilíbrio com e sem loja
- [x] Teste de estresse (`bun run stress` e `campaign.test.ts`): a campanha inteira jogada por bots que compram na loja, repetem a fase quando perdem e voltam a fases já vencidas para juntar moedas. Hoje o bot bom termina em ~220 partidas; o médio, que nunca aprende, para entre as fases 10 e 14
- [x] Fases de chefão calibradas com 8 partidas (6 vitórias) em vez de 5, porque a luta varia mais (104 testes)
- [x] Campanha que pede persistência: ~220 partidas para as 50 fases (umas 4,5 por fase, contando as voltas a fases antigas; as mais duras pedem 9 a 14 tentativas). A calibração exige metade das vitórias (um terço no chefão que fecha o mundo) com 8 partidas
- [x] Economia "a primeira vez vale mais": derrota não paga; vencer a mesma fase de novo paga 50%, 25% e depois nada; estrela nova paga 25 🪙 sempre. Fecha o farm de morrer de propósito (rendia de 3 a 4 vezes mais por minuto que vencer) e o de repetir a mesma fase
- [x] Traço do esquadrão como mediana de três partidas; chefão que acorda ao alcance dos tiros; vida do chefão esticada pela pressão entre 70% e 115%

**Visual e som**
- [x] Personagens montados por peças com contorno: soldado, seis inimigos, cinco chefões, quatro armas, três veículos, espinhos, mina, avião, bomba, míssil, barril explosivo e meteoro; escudo do Mecha, fogo no chão e laser desenhados na cena
- [x] Cenário próprio em cada mundo: ponte pênsil com água animada, deserto, cidade, neve e vulcão, com horizonte e clima
- [x] Efeitos: clarão no cano, rastro luminoso, bola de fogo com onda de choque, fumaça, poeira e tremor de câmera
- [x] Som sintetizado e botão de mudo
- [x] Sons mais realistas (pedido do usuário: "parece Super Nintendo"): tiros, explosões e golpes em camadas de ruído filtrado, tranco grave e eco de sala, cada disparo um pouco diferente e vindo do lado onde acontece; compressor no fim da mixagem; sons próprios para míssil, barris rolando, laser, gelo, meteoro, fogo crepitando e a fúria
- [x] Música por momento: suave no menu, de ação na fase e mais tensa no chefão (entra quando ele acorda, fica mais pesada na fúria e volta quando ele cai), com troca suave entre elas
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
- [x] Barra de vida do chefão no topo, no lugar da barra de progresso enquanto ele está à vista: nome, número e um rastro claro que mostra o dano de cada rajada; aviso "Chefão derrotado!" quando ele cai
- [x] Cada chefão se apresenta ao acordar ("O General lança mísseis: derrube a tiros ou saia da mira"), e cada golpe diz o que levou ou que você escapou; o aviso grande ("SAIA DA FAIXA!", "SAIA DO FOGO!", "CONGELADOS!") empurra as mensagens em vez de cobri-las; mensagem repetida conta "×2"
- [x] Telas com transição, botões com resposta e tudo respeitando `prefers-reduced-motion`

**Instalação e publicação**
- [x] PWA instalável: manifesto, ícones desenhados por código (`bun run icons`), tela cheia e em pé
- [x] Joga sem internet depois da primeira visita: o service worker guarda o jogo inteiro (~1,1 MB); a versão nova baixa em segundo plano e entra na abertura seguinte, sem recarregar a página no meio de uma fase
- [x] `vercel.json` para a Vercel montar o cliente (o mesmo esquema do Bomb Arena, sem servidor)
- [x] Versão do save: uma versão nova pode zerar o progresso de todo mundo, com aviso no menu (usado na versão dos chefões novos)
- [x] Publicado em https://squad-x-web-inky.vercel.app (a cada push no `master`), com o endereço no README, no `CLAUDE.md` e no "About" do GitHub, junto com a descrição e os tópicos do repositório

**Documentação e licença**
- [x] Licença PolyForm Strict 1.0.0, com permissão extra para pull requests (a mesma do Bomb Arena)
- [x] README com banner, GIF, prints dos personagens, mundos e telas; CLAUDE.md e AGENTS.md para agentes de IA; ARCHITECTURE, DECISIONS e esta lista
- [x] Folha de referência visual `docs/design-system.html` (também como artifact do Claude)
