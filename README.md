# Meu Leitor

E-reader pessoal em PWA para EPUB e PDF. HTML/CSS/JS puro (sem framework, sem
build step), pensado para rodar leve em hardware antigo (ex.: Galaxy Tab 3
Lite). Tudo roda no navegador — sem backend, sem contas, sem telemetria.

## Rodar localmente

Qualquer servidor estático serve (o app usa `fetch`/service worker, então
`file://` direto não funciona). Exemplo com Python:

```bash
python -m http.server 8090
```

Depois abra `http://localhost:8090`.

## Publicar no GitHub Pages

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <url-do-seu-repo>
git push -u origin main
```

No GitHub: Settings → Pages → Deploy from branch → escolha `main` e a pasta
raiz (`/`). O site fica em `https://<usuario>.github.io/<repo>/`.

Depois de qualquer atualização, é só dar `git push` de novo — o service
worker busca a versão nova na rede primeiro (veja "Decisões técnicas"), então
quem estiver online recebe a atualização sem precisar limpar cache.

## Instalar no tablet

1. Abra a URL do GitHub Pages no Chrome do tablet.
2. Menu (⋮) → "Adicionar à tela inicial" / "Instalar app".
3. O app abre em tela cheia, como um app nativo, e funciona offline depois da
   primeira visita.

## Estrutura

```
index.html         biblioteca (importar, listar, abrir livro)
reader.html         leitor (EPUB via epub.js, PDF via PDF.js)
manifest.json        metadados do PWA
sw.js                 service worker (cache do app shell)
js/db.js              acesso ao IndexedDB (livros, progresso, config)
js/library.js         lógica da biblioteca
js/reader.js           orquestrador do leitor (tema, fonte, navegação)
js/reader-epub.js      wrapper do epub.js
js/reader-pdf.js       wrapper do PDF.js
vendor/                epub.js, jszip, pdf.js (baixados, sem CDN em runtime)
icons/                 ícones do PWA
scripts/gen-icons.js   gera os ícones placeholder (rodar com `node scripts/gen-icons.js`)
```

## Decisões técnicas

- **epub.js + PDF.js vendorizados localmente** (não via CDN): garante que o
  app funcione 100% offline depois da primeira visita, sem depender de um
  CDN estar no ar.
- **`pdfjs-dist@3.11.174`, não a versão mais nova**: as versões recentes do
  PDF.js migraram para build ES Module (`.mjs`), que depende de suporte mais
  moderno de navegador. A 3.x ainda publica um build clássico
  (`pdf.min.js`), mais seguro para o Android/WebView antigo do tablet.
  Se no futuro você confirmar que o navegador do tablet está atualizado, dá
  pra migrar para uma versão mais nova do PDF.js.
- **Sem SPA / sem router**: biblioteca e leitor são páginas HTML separadas
  (`index.html` e `reader.html`). Isso é proposital: ao voltar para a
  biblioteca, o navegador descarrega inteiramente o epub.js/PDF.js da
  memória, em vez de acumular estado de várias leituras — importante num
  tablet com pouca RAM.
- **epub.js/PDF.js carregados sob demanda**: a biblioteca não carrega essas
  bibliotecas pesadas (só entram em cena quando você importa ou abre um
  livro daquele formato). A tela de biblioteca fica leve mesmo com uma
  estante grande.
- **PDF: zoom real, não escala de CSS**: cada nível de zoom re-renderiza a
  página no canvas na resolução correta (multiplicado pelo `devicePixelRatio`
  do tablet), então o texto fica nítido em vez de borrado.
- **Progresso e configurações de leitura são globais** (tema, fonte,
  espaçamento, zoom), e a posição de leitura é por livro. Simplifica o MVP;
  dá pra tornar configurações por-livro depois se fizer falta.
- **Service worker com "network-first" no app shell**: HTML/CSS/JS tentam
  rede primeiro, com fallback pro cache quando offline. Isso evita o
  problema clássico de PWA ficar "presa" numa versão antiga em cache — cada
  `git push` chega para quem estiver online. Só os arquivos grandes de
  `vendor/` (que não mudam) usam cache-first.
- **Sem PII/EXIF nem upload**: os arquivos de EPUB/PDF importados ficam
  só no IndexedDB do navegador do próprio tablet; nada é enviado a lugar
  nenhum.

## Fase 2 implementada

- **Modo foco** (botão ◎ na barra do leitor): tenta tela cheia + trava de
  orientação em retrato (`Fullscreen API` + `Screen Orientation API` — só
  funcionam de verdade num navegador que suporte, tipicamente o app já
  instalado como PWA; se a API não existir, o app degrada de forma
  silenciosa e só esconde a barra de navegação do app), esconde a barra do
  app, e roda um timer Pomodoro (duração configurável em Configurações). Ao
  fim de cada bloco de foco, a pausa começa sozinha (auto-pause) com
  contagem regressiva; dá pra pular a pausa e voltar a ler.
- **Ajuste de cor por horário**: liga/desliga em Configurações. Quando
  ativado, aplica um filtro CSS (`sepia`/`saturate`/`brightness`) sobre a
  área de leitura que esquenta a cor gradualmente entre 17h e 20h e mantém
  o tom quente até as 6h — recalculado a cada minuto enquanto o leitor está
  aberto. Funciona em cima de qualquer tema (claro/escuro/sépia).

## Limitação conhecida: "reflow" de PDF

PDF é um formato de posicionamento fixo — texto reflow real (recompor o
layout como um EPUB) só é confiável com extração de texto e é frágil para
PDFs complexos (colunas, tabelas, digitalizações). O MVP entrega zoom nítido
e leitura fluida em vez de reflow; se isso for essencial no seu uso,
podemos avaliar na fase 2 uma extração de texto para PDFs simples de coluna
única.
