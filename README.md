# Aestimatio — Atlas de Avaliação Somativa

Aplicação web estática para gerir a avaliação de turmas, testes, questões de aula, domínios, classificações e participação. Interface em português de Portugal, destinada a professores.

> **Estado:** versão inicial para testes. Os dados são guardados no navegador; a ligação à Google Sheets e Google Docs necessita de configuração OAuth. Antes de introduzir dados reais de alunos, confirmar requisitos de privacidade e segurança da escola.

## Iniciar

A aplicação está no ficheiro `index.html` da raiz. Para testar localmente:

```bash
python3 -m http.server 8000
```

Abrir `http://localhost:8000`. Para utilização futura em GitHub Pages, publicar a branch `main` a partir da pasta `/ (root)`; endereço previsto: `https://lilia-mendes.github.io/aestimatio/`. **O GitHub Pages ainda não foi ativado.**

## Guia de utilização

1. **Criar turmas:** na secção de turmas, adicionar uma turma e identificá-la pelo ano e designação.
2. **Gerir alunos:** selecionar a turma e adicionar, editar ou remover alunos. Confirmar cuidadosamente antes de eliminar registos associados.
3. **Definir períodos ou semestres:** criar os momentos de avaliação pela ordem cronológica. Cada período/semestre tem as suas avaliações, estrelas e classificação final, independentemente dos outros.
4. **Criar testes e questões de aula:** escolher a turma e o período, selecionar o tipo de avaliação, definir o título, a ponderação e as perguntas. Para cada pergunta, indicar a cotação e o domínio. A cotação total de uma avaliação deve ser **200 pontos**.
5. **Introduzir classificações:** abrir a grelha da avaliação e preencher, para cada aluno, os pontos obtidos em cada pergunta. A aplicação soma os pontos e converte a classificação para a escala de **0–20 valores**.
6. **Analisar domínios:** as classificações por domínio são calculadas com base nas perguntas nele incluídas, permitindo identificar áreas mais fortes e mais frágeis.
7. **Registar estrelas:** assinalar comportamentos positivos ou participação. As estrelas ficam associadas ao aluno e ao período/semestre.
8. **Configurar a majoração:** nas definições, escolher o número máximo de estrelas e o máximo de valores de bónus, comuns às turmas. Exemplo: com máximo de 25 estrelas e majoração de 1 valor, 10 estrelas conferem 0,40 valores; 25 ou mais conferem 1 valor.
9. **Consultar notas:** a nota base do período é a média ponderada das avaliações registadas, segundo os respetivos pesos. O bónus das estrelas é adicionado à nota do período, limitado a 20 valores. É possível escolher a regra da nota anual: média dos períodos/semestres com avaliação ou nota do último.
10. **Exportar:** usar a exportação Excel para obter as folhas organizadas de classificações, avaliações, domínios e alunos. Exportar também uma cópia JSON para preservar todos os dados e poder restaurá-los depois.

### Regras de cálculo

- Pontuação da avaliação: **0 a 200 pontos**.
- Nota da avaliação: `pontos ÷ 10` (0 a 20 valores).
- Nota base do período: `soma(nota da avaliação × peso) ÷ soma dos pesos` das avaliações com classificação.
- Bónus: `min(estrelas obtidas, máximo de estrelas) ÷ máximo de estrelas × majoração máxima`.
- Nota final do período: `min(20, nota base + bónus)`.
- Nota anual: média dos períodos avaliados **ou** nota do último período avaliado, conforme configuração.

Confirmar sempre se as regras de ponderação e arredondamento coincidem com os critérios aprovados na escola.

## Dados e cópias de segurança

A aplicação funciona sem backend e persiste dados no **localStorage** do navegador atual. Esse armazenamento:

- Não sincroniza automaticamente entre dispositivos ou perfis de navegador.
- Pode perder-se quando se limpa o armazenamento do browser.
- Não deve ser considerado, por si só, uma solução de segurança adequada para dados pessoais de alunos.

Exportar periodicamente um ficheiro **JSON** para uma localização protegida. A exportação **Excel (.xlsx)** depende do carregamento da biblioteca SheetJS pela internet.

## Integração Google Sheets

A Google Sheets é usada como armazenamento remoto opcional, através de sincronização **manual** (enviar ou importar). Não há edição colaborativa com resolução automática de conflitos.

1. Abrir [Google Cloud Console](https://console.cloud.google.com/).
2. Criar ou selecionar um projeto Google Cloud.
3. Ativar as **Google Sheets API** e **Google Drive API**.
4. Configurar o ecrã de consentimento OAuth, incluindo os utilizadores de teste, se necessário.
5. Criar credenciais **OAuth Client ID**, tipo **Web application**.
6. Em **Authorized JavaScript origins**, indicar a origem onde a aplicação corre: para testes locais, `http://localhost:8000`; depois de ativar GitHub Pages, `https://lilia-mendes.github.io`.
7. Na aplicação, abrir **Definições > Google Sheets**, introduzir o Client ID, guardar a ligação e iniciar sessão Google.
8. Criar ou associar uma spreadsheet e usar os controlos para **enviar dados** ou **importar dados**.

**Atenção:** importar de Sheets substitui os dados locais. Exportar JSON antes dessa operação. A integração ainda não foi testada com credenciais Google reais.

## Integração Google Docs

Nas avaliações, é possível associar o identificador de um documento Google Docs ao teste ou questão de aula. A aplicação permite abrir o documento associado. **Ainda não extrai automaticamente perguntas ou cotações do Google Docs.**

## Publicação futura no GitHub Pages

Quando a aplicação for validada:

1. Abrir o repositório no GitHub.
2. Entrar em **Settings > Pages**.
3. Em **Build and deployment**, escolher **Deploy from a branch**.
4. Escolher a branch **main** e a pasta **/ (root)** e guardar.
5. Confirmar o endereço publicado e atualizar a origem autorizada nas credenciais Google OAuth.

A aplicação estática publicada no GitHub Pages **não autentica professores por si só**. Não colocar dados de alunos, tokens de acesso, chaves privadas ou exportações com informações pessoais no repositório público. Para utilização escolar real, rever a proteção dos dados, os acessos e a estratégia de cópias de segurança antes da publicação.

## Limitações da versão inicial

- A sincronização Google Sheets é manual; não suporta edição concorrente segura.
- A integração Google Docs associa e abre documentos, mas não importa o seu conteúdo.
- Os dados locais estão limitados ao navegador em uso.
- A autenticação Google e as suas APIs exigem internet e configuração prévia.
- A exportação Excel depende de um recurso externo.
- A aplicação precisa de testes adicionais com dados fictícios e credenciais reais antes de uso em produção.

## Tecnologias

HTML, CSS e JavaScript, sem processo de compilação, com armazenamento `localStorage`, Google Identity Services, Google Sheets API, Google Drive API e SheetJS para a exportação Excel.

## Repositório

https://github.com/lilia-mendes/aestimatio
