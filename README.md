# Aestimatio — Atlas de Avaliação Sumativa

Aplicação web estática, em português de Portugal, para organizar a avaliação de turmas, alunos, instrumentos, domínios, estrelas, pautas e dashboards. Destina-se a apoiar o trabalho de professores.

**Aplicação:** https://lilia-mendes.github.io/aestimatio/  
**Código:** https://github.com/lilia-mendes/aestimatio

> **Estado em 11 de novembro de 2026:** funcionalidades implementadas e em validação. A aplicação está configurada para GitHub Pages; a publicação de cada alteração depende da conclusão do workflow do GitHub. A integração Google requer configuração própria e os fluxos de sincronização/conflitos ainda precisam de testes completos em dispositivos reais. Antes de trabalhar com dados pessoais de alunos, confirmar regras da escola, permissões e conformidade com o RGPD.

## 1. Como utilizar

1. **Anos letivos e regimes:** criar o ano letivo e configurar regime semestral ou trimestral e os respetivos períodos.
2. **Turmas:** adicionar cada turma, associando-a ao ano letivo e regime.
3. **Alunos:** selecionar a turma e introduzir os alunos.
4. **Domínios:** em **Definições → Domínios de avaliação**, configurar a lista finita de domínios da turma e os seus pesos, cuja soma deve ser **100%**. Na criação das perguntas de Testes e Questões de Aula, o domínio é escolhido num **seletor**, não introduzido livremente.
5. **Avaliações:** criar **Teste**, **Questão de Aula** ou **Trabalho**, definindo data, período, nome e peso relativo do instrumento na nota do período.
6. **Classificar aluno:** selecionar **Turma → Período/semestre → Instrumento → Aluno**; preencher as classificações e, se necessário, as anotações de cada pergunta ou critério.
7. **Estrelas:** registar participação/comportamento e consultar os movimentos no histórico.
8. **Relatórios de avaliação:** abrir o submenu do menu lateral e escolher a pauta ou dashboard pretendido.
9. **Definições:** configurar a nota anual, majoração de estrelas, Google Sheets, domínios, pesquisas no Drive e cópias de segurança.

O menu lateral pode ser aberto/recolhido também em ecrãs pequenos. As cinco vistas dos relatórios **não** se encontram em separadores horizontais: são entradas do submenu **Relatórios de avaliação**.

### Navegação durante o scroll

Quando o cabeçalho principal deixa de estar visível, surge uma **barra fixa** com o botão do menu, título da funcionalidade e estado da ligação Google. Em **Classificar aluno** surge, por baixo, uma barra contextual com aluno, turma e instrumento. Em **Dashboard do aluno**, a barra contextual apresenta aluno, turma e período/semestre. Ambas desaparecem quando os seletores regressam à área visível.

A barra fixa utiliza um **gradiente avermelhado** quando a sincronização não está confirmada (desligada, pendente, offline, erro ou conflito). O ícone de ligação permite solicitar sincronização ou voltar a autenticar; em caso de conflito, não força a substituição de dados.

## 2. Instrumentos e regras de classificação

### Testes e Questões de Aula

- Uma avaliação é constituída por perguntas com enunciado, **domínio selecionado da lista** e cotação.
- A soma das cotações das perguntas deve ser **200 pontos**.
- Cada classificação fica limitada a **0–cotação da pergunta**.
- As classificações em falta permanecem **por preencher**, e não são tratadas como classificações definitivas de zero.
- Os enunciados são apresentados inicialmente numa linha; ao clicar, expande-se apenas o texto. Os campos de classificação e anotação permanecem visíveis.
- Cada domínio é normalizado internamente para **0–200 pontos**: `notaDominio200 = pontosObtidosNoDominio / cotacaoDoDominio × 200`.
- A nota do instrumento considera a ponderação dos domínios aplicáveis: `notaInstrumento20 = Σ(notaDominio200 × pesoDominio) / Σ(pesosAplicáveis) / 10`.
- Os domínios de **História A**, quando configurados com os pesos de referência, são **Tratamento de Fontes (20%)**, **Compreensão Histórica (60%)** e **Comunicação em História (20%)**.
- A aplicação apresenta a nota do instrumento e de cada domínio em **0–20 valores com uma casa decimal**. Os cálculos preservam a precisão interna até à apresentação.

**Importante:** uma avaliação incompleta pode mostrar uma **nota provisória** na interface individual. Avaliações incompletas não entram como notas definitivas nas médias e pautas. A ausência de classificação num domínio não significa zero.

### Trabalhos

- O **Trabalho** é um instrumento independente dos domínios. **Não se associa qualquer domínio aos seus critérios**.
- Cada critério tem uma designação, uma **classificação individual de 0–200 pontos** e um **peso expresso em pontos**.
- A soma dos pesos dos critérios de um Trabalho deve ser **200 pontos** (não 100%).
- **Classificação final do Trabalho, na escala 0–200:** `Σ(classificaçãoCritério × pesoCritério) / 200`. Para obter a nota de 0–20, dividir por 10.
- Exemplo: critérios com pesos **80, 60, 40, 20** e classificações **160, 180, 150, 170** dão **165/200 = 16,5 valores**.
- É possível reutilizar os critérios de outro Trabalho e atribuir anotações na classificação individual.
- Os Trabalhos **contam para a nota global** do período de acordo com o seu peso enquanto instrumento, mas **não** contam para classificações, médias ou gráficos **por domínio**.
- A pauta de um Trabalho mostra o detalhe **por critério**, não por domínio.
- Trabalhos antigos cujos critérios somavam 100 podem ser editados ou reutilizados com conversão proporcional dos pesos para 200, preservando a média ponderada.

A **ponderação dos critérios dentro do Trabalho** e o **peso do Trabalho na nota global do período** são configurações diferentes.

### Períodos, estrelas e nota anual

- A nota base do período corresponde à **média ponderada dos instrumentos com classificação completa** e peso positivo: `Σ(notaInstrumento20 × pesoInstrumento) / Σ(pesosInstrumentosAvaliados)`.
- A majoração das estrelas é configurável: `bónus = min(estrelas, máximoEstrelas) / máximoEstrelas × majoraçãoMáxima`.
- A nota final do período é limitada a 20: `min(20, notaBase + bónus)`.
- A regra da nota anual pode ser **média dos períodos/semestres avaliados** ou **nota do último período/semestre com avaliação**.
- As estrelas têm botões de adicionar/remover, progresso e **histórico de movimentos**, com data/hora. Os movimentos não são apagados silenciosamente.

Os exemplos e configurações devem ser revistos à luz dos critérios de avaliação efetivamente aprovados na escola.

## 3. Classificar aluno

Em **Classificar aluno**, os quatro seletores em cascata determinam a avaliação individual. Para cada pergunta ou critério, a página disponibiliza classificação e anotação. No final mostra os pontos obtidos e a nota em 0–20 (com indicação de provisória quando aplicável).

- Para Testes e Questões de Aula, apresenta também cotação, peso e classificação por domínio.
- Para Trabalhos, apresenta a nota ponderada do Trabalho e uma explicação de que não existe associação a domínios.
- Os botões **Aluno anterior** e **Aluno seguinte** agilizam a classificação sequencial.
- O cabeçalho contextual fica visível durante o scroll, abaixo do cabeçalho global.

## 4. Relatórios de avaliação

As vistas encontram-se num **submenu expansível** da barra lateral:

| Entrada | Conteúdo |
| --- | --- |
| **Pauta por instrumento** | Notas dos alunos; em Testes e Questões de Aula, alternância entre **detalhe por pergunta** e **por domínio**; nos Trabalhos, detalhe por critério. |
| **Pauta semestral** | Instrumentos, respetivos contributos ponderados, bónus das estrelas e classificação final. |
| **Dashboard do aluno** | Classificação global, contributos dos instrumentos, classificações por domínio, evolução global e por domínio, histórico cronológico de anotações. |
| **Dashboard da turma** | Evolução das classificações dos alunos ou das médias por domínio, com possibilidade de mostrar/ocultar séries. |
| **Dashboard global** | Evolução das médias por turma e da média global; comparação por domínio e controlo das séries apresentadas. |

Nos gráficos **globais**, os Trabalhos entram nos resultados globais, **não** nas curvas por domínio. A ausência de avaliações válidas é representada como ausência de dados, nunca como zero. As médias são apresentadas numa escala de 0–20.

As pautas são adaptadas a ecrãs pequenos, usando cartões quando necessário.

## 5. Guardado local, cópias e exportação

Cada alteração é guardada no **`localStorage` do navegador**. Este é um mecanismo local, que pode ser apagado ao limpar os dados do browser ou ao usar um perfil diferente. O guardado local **não prova**, por si só, que a alteração já foi enviada ao Google Sheets.

Em **Definições → Segurança e cópias de segurança**:

- **Exportar Excel:** gera um ficheiro `.xlsx` com folhas de avaliação, questões, notas, domínios, critérios dos Trabalhos e movimentos das estrelas. Necessita da biblioteca SheetJS carregada através da Internet.
- **Cópia JSON:** exporta os dados da aplicação para arquivo ou recuperação.
- **Importar JSON:** substitui os dados locais após confirmação; criar previamente uma cópia dos dados que se pretendem conservar.

A aplicação inclui também cópias locais preventivas em algumas operações de migração e sincronização. Estas cópias **não substituem** uma estratégia de backup independente e protegida.

## 6. Google Sheets e sincronização automática

A integração é opcional e utiliza **Google Identity Services**, **Google Drive API** e **Google Sheets API**. A aplicação não dispõe de servidor próprio. A base remota é uma **spreadsheet**, geralmente situada na pasta `/aestimatio` do Google Drive. **Encontrar documentos no Drive não é o mesmo que identificar ou sincronizar a spreadsheet de dados.**

### Configuração inicial

1. No [Google Cloud Console](https://console.cloud.google.com/), criar/selecionar um projeto e ativar **Google Sheets API** e **Google Drive API**.
2. Configurar o ecrã de consentimento OAuth. No modo de teste, adicionar os utilizadores autorizados como testadores.
3. Criar um **OAuth Client ID** do tipo *Web application* e incluir a origem JavaScript adequada (por exemplo `https://lilia-mendes.github.io`; para desenvolvimento local, `http://localhost:8000`).
4. Em **Definições → Google Sheets · base de dados**, preencher o **Client ID** e, se necessário, o **ID da spreadsheet**. Clicar em **Guardar ligação** e **Iniciar sessão Google**.
5. Se não existir base de dados, escolher **Criar spreadsheet em /aestimatio**. Caso exista, utilizar **Procurar base no Drive**, tendo em atenção que a pesquisa da base se destina às spreadsheets da pasta `/aestimatio`.
6. Efetuar a **primeira importação ou envio explícito**: **Enviar dados para Sheets**, se a versão local é a fonte de verdade, ou **Importar de Sheets**, se os dados da spreadsheet devem ser recuperados. **Estas ações manuais podem substituir dados**; exportar um JSON antes.
7. Consultar a secção **Sincronização automática entre dispositivos**. A sincronização automática só é inicializada quando a aplicação consegue reconhecer o estado de partida entre a base local e a remota.

### Funcionamento e estados

Com sessão Google válida, spreadsheet identificada e sincronização previamente inicializada:

- Os dados são guardados localmente e a aplicação **tenta sincronizar automaticamente** após alterações (com um curto intervalo), ao regressar à janela e em verificações periódicas.
- Antes de enviar, o código compara dados locais, base anterior e dados remotos. Alterações independentes podem ser conciliadas; alterações concorrentes incompatíveis são sinalizadas como **conflito**.
- Em conflito, a sincronização automática **não deve substituir** os dados remotos. É necessária revisão humana e uma cópia de segurança.
- Se a ligação falhar, os dados locais permanecem no navegador; o envio não deve ser assumido como concluído.
- O indicador no topo pode mostrar **Sincronizado**, **A sincronizar**, **Pendente**, **Sem rede**, **Google desligado** ou **Conflito/erro**.
- A barra fixa usa um **gradiente avermelhado** quando não existe sincronização confirmada. Clicar no ícone permite tentar sincronizar ou voltar a autenticar; em conflito encaminha para as Definições.
- O botão de **Copiar ligação para outro dispositivo** ajuda a transferir a configuração pública do Client ID; **não** transfere autenticação, dados nem credenciais privadas.

**Limite importante:** a deteção de conflitos é uma proteção implementada na aplicação, **não é garantia transacional de ausência de perda de dados**. Existem limites de concorrência, redes instáveis, credenciais expiradas e possíveis falhas de API. Os fluxos de sincronização e recuperação devem continuar sob validação antes de depender exclusivamente da spreadsheet.

## 7. Pesquisa de ficheiros no Google Drive

Em **Definições → Google Docs · documentos das avaliações**, a pesquisa de ficheiros:

- Pesquisa por omissão em **Todo o meu Google Drive**, com opção de restringir à pasta `/aestimatio`.
- Pode apresentar **Google Docs, ficheiros Word, PDF e outros tipos de ficheiro** acessíveis à conta autorizada.
- Faz pesquisa complementar por nome, sem distinguir maiúsculas/minúsculas ou acentos.
- Oferece os comandos **Abrir** e **Copiar ID**; a opção de restrição à pasta `/aestimatio` considera os ficheiros diretamente nessa pasta.
- Pode ter resultados incompletos em Drives muito grandes, pastas não indexadas ou ficheiros sem permissões adequadas.

A avaliação permite guardar o ID de um documento associado. **Não existe importação automática das perguntas e cotações a partir do conteúdo do documento.**

## 8. Publicação e desenvolvimento

O repositório usa ficheiros estáticos e não exige processo de compilação:

- `index.html`: estrutura e lógica base.
- `enhancements.js`: domínios, Trabalhos, classificação individual, estrelas e relatórios.
- `enhancements.css`: estilos responsivos, submenu lateral e cabeçalhos.
- `cloudsync.js`: sincronização e indicador de ligação Google.
- `README.md`: documentação de utilização e manutenção.

Para servir localmente, na raiz do repositório:

```bash
python3 -m http.server 8000
```

Abrir `http://localhost:8000`. As permissões OAuth devem incluir essa origem quando usadas localmente.

A publicação online usa o GitHub Pages: `https://lilia-mendes.github.io/aestimatio/`. Confirmar a conclusão do workflow na secção [Actions](https://github.com/lilia-mendes/aestimatio/actions) antes de assumir que uma alteração do GitHub já está acessível no navegador. Quando houver alterações recentes, pode ser necessário atualizar a página forçando a atualização da cache.

## 9. Proteção de dados e limitações atuais

- **Dados de alunos são dados pessoais.** Confirmar autorização institucional, base legal aplicável, permissões de acesso à spreadsheet, retenção e boas práticas de segurança e RGPD.
- O GitHub Pages publica o código, **não autentica professores nem protege autonomamente a interface**. A autorização Google controla o acesso aos recursos Google do utilizador; não equivale a autenticação institucional da aplicação.
- Nunca colocar listas de alunos, exportações reais, tokens OAuth ou segredos no repositório público.
- O `localStorage` não é um repositório seguro nem uma cópia de segurança suficiente para dados sensíveis.
- A integração com Google Sheets e a recuperação de conflitos **precisam de mais testes de ponta a ponta**, sobretudo com edições concorrentes em dispositivos diferentes.
- A pesquisa no Drive depende das permissões Google, limites de paginação e disponibilidade das APIs.
- A representação de notas e domínios deve ser confrontada com os critérios de avaliação efetivamente adotados pela escola.

O acompanhamento de funcionalidades e validações pendentes encontra-se nos [issues do GitHub](https://github.com/lilia-mendes/aestimatio/issues).

---

**Última revisão da documentação:** 11 de novembro de 2026.  
**Licença:** consultar `LICENSE` no repositório.
