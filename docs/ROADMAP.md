# Roadmap

## Feito

- [x] Monorepo (Bun workspaces), engine pura e cliente React + Three.js
- [x] Esquadrão que corre, atira em colunas e cresce/encolhe com os portais
- [x] Portais `+N`, `-N` e `×N`; atirar neles sobe o número (cada passo custa mais quanto maior o valor)
- [x] Dilemas de portal: o vermelho grande que dá para "bombear" a tiros, soma contra multiplicação, os dois ruins
- [x] Barris com vida (proporcional ao poder de fogo) que soltam arma, veículo, soldados ou moedas; o barril na faixa protege quem está atrás
- [x] Veículos (moto, helicóptero e tanque) que correm ao lado do esquadrão com tiro próprio, até 4 por vez
- [x] Inimigos: corredor, rápido, brutamonte, escudo (reduz o tiro de soldado, o tanque e o helicóptero ignoram), bombardeiro (explode, em cadeia) e atirador (recua e atira)
- [x] Chefão fixo na pista, visível de longe: o esquadrão para na frente dele, ele marca uma faixa de aviso que dá para desviar e chama lacaios; a linha de chegada fica depois dele
- [x] Modos de fase (Portais, Barris, Misto) e características por fase (Enxame, Elite, Emboscada, Escassez, Correria, Armadilhas)
- [x] Ritmo: primeiro combate em ~2 s, encontros a cada 12–18 unidades, hordas espaçadas, dificuldade subindo ao longo da fase
- [x] Gerador por semente que dimensiona hordas e barris pelo poder que o esquadrão terá, 5 cenários e inimigos novos a cada mundo
- [x] Três bots (bom, médio, parado) e testes de equilíbrio: o bom vence ≥ 22 das 30 primeiras fases, o médio no mínimo 3 a menos, o parado ≤ 11
- [x] Mapa de fases, estrelas, moedas e progresso salvo no navegador
- [x] Loja de melhorias (dano, reforços, butim) que passam a valer em todas as fases
- [x] Visual 3D estilizado: soldado com capacete, colete e mochila; inimigos com rosto e silhueta própria; cinco chefões; armas reconhecíveis; contorno, piscada ao levar tiro, empurrão e queda; céu em degradê, nuvens, postes, cactos, pinheiros, lava
- [x] Efeitos: clarão no cano, rastro luminoso, bola de fogo com onda de choque, fumaça e poeira
- [x] Dificuldade calibrada pela própria fase (o jogo joga a fase com o bot bom e escolhe a pressão mais alta que ainda é vencível)
- [x] Galeria `?galeria=1` para revisar os modelos de perto
- [x] Som sintetizado (efeitos de tiro, acerto, portais, barris, veículos, explosões, chefão; música do menu e da batalha) e botão de mudo
- [x] Controles: arrastar o dedo ou ← → / A D

- [x] Fases com o dobro do tamanho e muito mais punitivas: portal ÷N que corta o esquadrão, portais vermelhos travados que não dá para "bombear", espinhos, minas e bombardeio (a partir da fase 6)
- [x] Resistência na loja (menos baixas) e recompensa por fase; a campanha é calibrada para o jogador que comprou o esperado: fases 1 e 2 sem loja, da 3 em diante sem comprar nada o bot bom perde
- [x] Calibração por simulação (`bun run calibrate`) com tabela gerada em `pressures.ts`
- [x] Interface: painel do que você tem (soldados, arma, veículos, melhorias), avisos do que aconteceu, relatório da fase, contadores que rolam e telas com transição

## Próximo

- [ ] Testar no celular de verdade: arrastar, tamanho dos bonecos, desempenho
- [ ] Gráfico: ver o que o usuário acha do redesenho dos bonecos, chefões, armas e efeitos; veículos e cenário ainda são os mais simples
- [ ] Armas diferentes de verdade (cadência e efeito), não só dano por segundo
- [ ] Mais variedade de chefões (um comportamento diferente por mundo)
- [ ] Mais modos no mapa: Defesa (cartas entre ondas), Chefão puro e Infinito
- [ ] Dificuldades Difícil e Pesadelo por mundo
- [ ] PWA instalável (manifest e ícones) e, depois, empacotar para a Play Store
- [ ] Dividir o bundle (o Three.js passa de 700 kB)
