# Task Planner Agent

CLI local que investiga um ticket em um repositório Git e cria um plano técnico com evidências, dúvidas, riscos e critérios de validação. O agente só lê o projeto; não implementa a tarefa nem executa comandos do projeto.

## Instalar o comando localmente

Requisitos: Node.js 22 ou posterior, npm e Git no PATH. Na pasta deste agente, rode uma vez:

```powershell
npm ci
npm run build
npm link
```

Isso disponibiliza o comando `plan` no terminal sem instalar dependências nos projetos que serão analisados. Se o terminal não reconhecer `plan`, feche e abra o terminal e confira se a pasta global de executáveis do npm está no PATH. No Windows, `plan.cmd` também pode funcionar quando a política do PowerShell bloqueia scripts `.ps1`. Para remover o link: `npm unlink --global task-planner-agent`.

## Primeiro uso

Configure um perfil interativamente:

```powershell
plan setup
```

Escolha OpenAI ou um endpoint compatível, informe o ID do modelo e o nome da variável de ambiente que guardará a chave. Para OpenAI, por exemplo:

```powershell
$env:OPENAI_API_KEY = "sua-chave"
```

A chave não é salva. Os perfis ficam em `~/.task-planner/config.json`, fora dos repositórios. Para usar uma configuração em outro caminho, defina `PLANNER_CONFIG`. Arquivos `.env` não são carregados automaticamente.

Em seguida, dentro de qualquer projeto Git:

```powershell
cd C:/projetos/minha-app
plan ./ticket.md
```

O projeto é detectado pela pasta atual, inclusive se você estiver em uma subpasta. Para apontar outro projeto, use `--repo C:/projetos/outra-app`. O ticket deve ser um arquivo UTF-8. O comando mantém a autorização de envio explícita: acrescente `--allow-remote-model` para permitir o envio do ticket e dos trechos encontrados ao provedor.

## Comandos úteis

```powershell
plan doctor                         # verifica perfil, chave e projeto atual
plan --dry-run ./ticket.md          # prévia local, sem chamadas remotas
plan ./ticket.md --allow-remote-model
plan ./ticket.md --profile local --model outro-modelo --allow-remote-model
plan ./ticket.md --json --allow-remote-model
```

No terminal interativo, o resultado é apresentado como relatório legível. Quando a saída é redirecionada, o comando emite JSON. Use `--json` para pedir JSON explicitamente:

```powershell
plan ./ticket.md --allow-remote-model --json > plan.json
```

`plan --help` lista as opções. `--repo` e `--ticket` continuam disponíveis para compatibilidade com o CLI anterior. `--inspect` também continua disponível como alias de prévia offline.

## Provedores e modelos

`plan setup` salva um perfil OpenAI ou um endpoint compatível com a API OpenAI, incluindo URL base, ID do modelo e nome da variável de ambiente para a chave. Um exemplo de endpoint local compatível seria `http://localhost:11434/v1`; use o endereço e as capacidades documentadas pelo serviço que estiver rodando. Endpoints remotos exigem HTTPS. HTTP só é aceito para localhost/loopback.

O modo compatível usa Chat Completions. Isso não traduz protocolos nativos de Anthropic, Gemini ou outros serviços, e não garante que todo modelo aceite chamadas de ferramentas e saída estruturada. `--model` substitui o modelo somente naquela execução. `OPENAI_MODEL` pode substituir o modelo de um perfil OpenAI.

## O que o agente lê

Somente arquivos versionados pelo Git são candidatos; alterações locais em arquivos versionados podem ser lidas. Arquivos ocultos, dependências, builds, tipos fora da allowlist, symlinks, arquivos grandes, binários, conteúdo UTF-8 inválido e padrões de segredo conhecidos são bloqueados. A filtragem de segredos é conservadora, pode bloquear código legítimo e não identifica todos os dados sensíveis. Revise a prévia e envie apenas conteúdo que você tem autorização para compartilhar.

As ferramentas de leitura e busca têm limites de tamanho, quantidade e tempo. O relatório registra limitações; referências são verificadas contra trechos realmente retornados pelas ferramentas, mas isso não prova que a interpretação do modelo esteja correta. Revise o plano antes de implementar.

SDK tracing está desabilitado e chamadas usam `store: false`; isso não substitui as políticas de retenção do provedor. O comando não faz chamadas remotas no `--dry-run` ou `--inspect`.

## Desenvolvimento

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

`npm test` cobre ferramentas de repositório, limites, privacidade, validação das evidências, CLI offline e execução do SDK com modelo roteirizado offline. Isso valida integração e comportamento determinístico, não a qualidade de raciocínio de um modelo real.

Para avaliar com tickets de exemplo, configure uma credencial e rode:

```powershell
npm run --silent eval -- --allow-remote-model > evaluation.json
```

Essa avaliação faz chamadas potencialmente cobradas. Consulte [a rubrica](docs/evaluation.md); a qualidade de planos reais ainda requer avaliação humana.
