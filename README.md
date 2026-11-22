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

A barra fixa utiliza um **gradiente avermelhado** quando a sincronização não está confirmada (desligada, pendente, offline, erro ou conflito). À direita, um **botão sem texto nem animação** mostra duas tomadas **ligadas** quando a ligação está saudável (inclusive durante a verificação) e **separadas** quando há um estado que exige atenção. O estado detalhado está no título acessível do botão e ao passar o rato. O clique solicita sincronização ou nova autenticação; em conflito, não força a substituição de dados.

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
- O indicador no topo representa **Sincronizado/A sincronizar** com tomadas ligadas e **Pendente, Sem rede, Google desligado ou Conflito/erro** com tomadas separadas. O ícone **nunca roda nem pisca**; o detalhe do estado está disponível no título do botão e para tecnologias de apoio.
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

## Resolução assistida de conflitos (novembro de 2026)

A secção **Definições → Identidade e resolução de conflitos** identifica a instalação local, apresenta contagens por entidade (local/Drive) e permite comparar versões antes de decidir. Existem quatro modos de resolução: substituir os dados locais pela versão remota, substituir o Drive pela versão local (dupla confirmação), ou fundir por identificador com precedência local/remota. Uma fusão mantém os registos exclusivos de ambas as origens; registos com o mesmo ID seguem a precedência selecionada. Antes de uma operação destrutiva, o Atlas tenta guardar uma cópia local de recuperação; a falta de espaço impede a operação. A exportação JSON continua disponível.

As publicações feitas pela nova rotina guardam também metadados de revisão, revisão anterior, data UTC, identificador da instalação e da operação na linha 3 da folha `Atlas_Config`. O identificador da instalação permanece no localStorage, mas não é uma identidade pessoal nem autenticação. As versões antigas sem metadados continuam legíveis. A aplicação verifica os dados remotos antes de escrever e volta a lê-los após a publicação. As alterações continuam a exigir que a Google autorize a sessão.

**Limitações importantes:** a Sheets API não fornece uma transação de comparação-e-escrita atómica de toda a spreadsheet. Dois escritores simultâneos ainda podem competir; não interpretar a verificação como garantia transacional. A resolução por campo individual, os marcadores de eliminação e uma coordenação de escritas com bloqueio são evoluções posteriores. Os backups preventivos permanecem no navegador onde foram criados (e podem ser eliminados com os dados desse navegador); é aconselhável descarregar um JSON para arquivo independente. As alterações devem ser testadas em dois dispositivos antes de utilização regular com dados reais.

## Segunda fase: resolução individual, eliminações e histórico (22/11/2026)

A interface de conflitos passou a incluir **Escolher a versão de cada registo incompatível**, além das quatro opções globais. Cada decisão seleciona a versão local ou do Drive, inclusive quando o registo foi eliminado numa origem. A pré-visualização executa validações de referências antes de permitir publicar. As escritas no Drive exigem duas confirmações, uma cópia de recuperação e uma leitura final de confirmação.

As eliminações realizadas através do guardado normal passam a gerar **marcadores de eliminação** na coleção `deletions`, publicada na nova folha **Eliminacoes**. Quando há marcador e a outra versão conserva apenas o mesmo registo original, a eliminação pode propagar-se. Quando há alteração concorrente, o estado é considerado conflito; um registo sem revisão verificável não é apagado automaticamente. Eliminações anteriores à introdução dos marcadores não são reconstruíveis retroativamente.

Em **Definições**, o histórico técnico apresenta operações recentes por instalação e disponibiliza as cópias preventivas locais para descarregar. As cópias descarregadas são contentores de recuperação (incluem dados, base e possivelmente imagem remota), não ficheiros diretamente importáveis pelo importador JSON da aplicação. Para restaurar, extrair a propriedade `data` depois de analisar o conteúdo. A criação do histórico local não equivale a auditoria transacional de cada classificação.

**Pendências:** proteção contra escritas concorrentes com serviço de coordenação ou base de dados transacional; testes reais de dois dispositivos, restauração a partir de cópias, semântica de eliminação em cascata e testes de carga. A Google Sheets API, sem coordenação adicional, não garante uma escrita condicional atómica. Não utilizar com classificações reais sem testar essas situações e manter uma exportação independente.

## Arquivo técnico no Google Drive: /aestimatio/history (22/11/2026)

Os **eventos técnicos de sincronização** passam a ser arquivados em ficheiros JSON dentro da pasta **`/aestimatio/history`** do Google Drive, criada automaticamente quando existe uma sessão Google válida. A folha principal do Atlas continua a conter apenas os dados operacionais e os metadados necessários à sincronização. O arquivo não contém notas nem registos completos de alunos, apenas data, identificador da instalação, tipo de evento e identificador técnico da spreadsheet. Cada remessa gera um ficheiro único, sem modificar ficheiros antigos.

Eventos ainda não enviados permanecem numa fila local no navegador; se o Google Drive falhar, a fila não é eliminada. O Atlas tenta arquivar após sincronizações e quando regressa a ligação, e disponibiliza em **Definições → Arquivo do histórico técnico** um botão para enviar eventos pendentes e consultar erros. O histórico técnico local anterior é transferido para esta fila na primeira execução da versão. A operação de sincronização de avaliações **não depende** do sucesso do arquivo; consultar o estado de arquivo separadamente. A pasta history não é pesquisada como base de dados ativa.

**Nota:** as cópias JSON preventivas de recuperação e os dados de alunos **não** são transferidos automaticamente para a pasta history. Continuam sob controlo local para evitar expor avaliações e para não confundir auditoria técnica com cópias de segurança. A criação real da pasta e o envio dependem de autorização Google, Internet e permissões sobre o Drive; verificar o indicador em Definições.


## Critérios de correção por pergunta (novembro de 2026)

Em **Testes** e **Questões de Aula**, cada pergunta começa sem critérios. O professor pode adicionar um ou mais critérios, com designação e peso positivo. Se existirem critérios, os pesos têm obrigatoriamente de somar **10**; critérios sem designação ou pesos inválidos impedem guardar a avaliação. Sem critérios, a pergunta mantém a classificação direta habitual. Os **Trabalhos** mantêm o seu sistema independente de critérios com pesos totais de 200.

Em **Classificar aluno**, uma pergunta com critérios apresenta um slider por critério entre 0 e `peso × 10`, com passo de 1, e um campo numérico com passo de 0,01. Pontuações não preenchidas continuam pendentes, distintas de zero. A nota sugerida é `soma das pontuações dos critérios × cotação da pergunta / 100`. Só fica definitiva quando todos os critérios estão preenchidos. O professor pode ativar ajuste manual depois de completar os critérios; a nota manual continua registada até regressar ao modo automático. Anotações continuam disponíveis por pergunta.

Os critérios são guardados no campo `questions[].criteria`, e as pontuações por aluno no campo `grades[].criterionScores`, preservando a classificação efetiva em `grades[].score`. Isto mantém as folhas existentes do Google Sheets e a compatibilidade com perguntas antigas. Para perguntas já classificadas, alterações estruturais aos critérios são bloqueadas. A exportação Excel acrescenta a folha **Criterios de correcao**. Edições concorrentes ao mesmo registo continuam sujeitas à deteção de conflitos existente; não há fusão automática de campos internos.


### Notas já atribuídas e critérios adicionados posteriormente

É possível adicionar ou alterar critérios em perguntas que já tenham classificações diretas, sem exigir a recorreção dos alunos. As notas existentes ficam preservadas como **classificações manuais**; os detalhes de critérios antigos incompatíveis são limpos e podem ser preenchidos posteriormente. Uma nota manual é válida mesmo com critérios por preencher e só é substituída quando o professor optar expressamente pelo modo automático. Permanecem os limites de cotação da pergunta e as proteções anteriores contra apagar perguntas já classificadas. Recomenda-se exportar uma cópia JSON antes de edições em massa ou sincronizações concorrentes.
