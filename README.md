# ServerMap (beta)

Painel privado de inventário manual de servidores, aplicações e reservas de portas.

## Arquitetura (obrigatória)

**Somente o PostgreSQL roda no Docker.** O frontend React compilado e a API Fastify rodam **diretamente no host, como processos gerenciados pelo PM2**, e não em containers.

| Serviço | Execução | Porta no host |
| --- | --- | --- |
| PostgreSQL | Docker | `127.0.0.1:5434` (5432 dentro do container) |
| API | PM2 host: `servermap-api` | `127.0.0.1:3333` |
| Web | PM2 host: `servermap-web` | `127.0.0.1:8080` |

A conexão da API ao PostgreSQL usa `DATABASE_URL` apontando para `127.0.0.1:5434`. Como a API roda fora do Docker, o banco precisa oferecer um endpoint no host; o bind local mantém a porta fora da interface pública. Não é uma rede Docker privada entre a API e o banco.

## Instalação / atualização (Linux)

Pré-requisitos: Node.js 22+, Docker/Compose, pnpm e PM2.

```bash
git clone -b beta https://github.com/MiguelAlmeidaJ/server-manager.git
cd server-manager
cp .env.example .env
```

Edite `.env`: substitua `POSTGRES_PASSWORD` e use a mesma senha na URL de `DATABASE_URL`. Se a senha tiver caracteres reservados, aplique URL encoding na parte da senha. Configure `ADMIN_API_TOKEN` aleatório, com pelo menos 32 caracteres. Não faça commit de `.env`.

```bash
docker compose up -d postgres
corepack enable
pnpm install
pnpm build
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 status
```

Acesse `http://127.0.0.1:8080` localmente e informe o token. Para acessar remotamente, use `ssh -L 8080:127.0.0.1:8080 usuario@servidor`.

### Se vier da versão anterior

A versão anterior colocou web e API em containers. O `compose.yaml` atual contém **somente postgres**. Antes de iniciar novos processos PM2:

```bash
docker compose stop web api 2>/dev/null || true
docker compose rm -f web api 2>/dev/null || true
docker compose up -d postgres
pnpm install
pnpm build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

Se os containers antigos tiverem nomes de projeto Compose diferentes, remova-os manualmente após confirmar os nomes em `docker ps`. **Não execute `docker compose down -v`**: isso apaga dados do volume PostgreSQL. Se houver um volume existente, preserve suas credenciais atuais.

### Operação

```bash
pm2 list
pm2 logs servermap-api
pm2 logs servermap-web
pm2 restart ecosystem.config.cjs --update-env
pm2 save
```

Para boot automático: `pm2 startup`, execute a instrução gerada e depois `pm2 save`. Recomenda-se executar PM2 com um usuário dedicado sem root.

## Windows / PowerShell

No Windows, **não execute `corepack enable` sem permissões administrativas**: ele pode falhar com `EPERM` ao tentar escrever em `C:\\Program Files\\nodejs`. Se `pnpm --version` já funcionar, pule esse comando.

```powershell
git checkout beta
git pull origin beta
# Se já existir um .env configurado, preserve-o.
docker compose up -d postgres
pnpm install
pnpm rebuild esbuild
pnpm build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
Invoke-RestMethod http://127.0.0.1:3333/api/health
```

Se o PM2 já estiver ativo, prefira `pm2 restart ecosystem.config.cjs --update-env`. Se o web build falhar com erro de esbuild, o `pnpm rebuild esbuild` pode reparar a instalação; em instalações novas, esbuild está autorizado no `pnpm.onlyBuiltDependencies`.

Verifique `pm2 logs servermap-api --lines 50` e `pm2 logs servermap-web --lines 50` se o status estiver online mas o endpoint falhar. O PM2 em estado `online` **não** substitui build bem-sucedido e teste HTTP.


## Edição e portas vinculadas (beta)

- Na aba **Servidores**, use **Editar** para alterar nome, IP, sistema operacional e ambiente.
- Na aba **Aplicações**, use **Editar** para alterar servidor, nome, stack e domínio.
- Ao editar uma aplicação, a seção **Portas da aplicação** permite incluir, alterar e remover várias reservas TCP/UDP com endereço de bind.
- A tabela de aplicações mostra as portas reservadas para cada uma; a aba **Portas** mostra a aplicação vinculada e também permite criar reservas avulsas ou vinculadas.
- Ao trocar o servidor de uma aplicação com portas vinculadas, remova ou libere primeiro as reservas antigas para evitar associar portas ao servidor errado.
- Conflitos de reservas são verificados por servidor, porta, protocolo e endereço de bind. **Não há detecção automática de portas já ocupadas no host**.

Novas rotas: `PUT /api/servers/:id`, `PUT /api/applications/:id` e `PUT /api/ports/reservations/:id`.

## Coleta automática de portas — Windows (beta)

O coletor é um script PowerShell somente leitura em `agents/collector/windows/collect.ps1`. Ele identifica TCP em LISTEN e endpoints UDP, com PID e nome de processo, e envia um **snapshot completo** à API. O token é exclusivo para cada servidor, não é o token administrativo do painel.

1. Atualize o projeto, faça `pnpm build` e reinicie com `pm2 restart ecosystem.config.cjs --update-env`.
2. Na aba **Portas**, escolha um servidor e clique **Gerar token**. Salve o token e o UUID do servidor. Gerar novamente revoga o anterior.
3. No próprio servidor Windows que será monitorado, copie o script, configure as variáveis e execute:

```powershell
$env:SERVERMAP_SERVER_ID = "UUID-DO-SERVIDOR"
$env:SERVERMAP_AGENT_TOKEN = "TOKEN-GERADO-PELO-PAINEL"
powershell -NoProfile -File .\agents\collector\windows\collect.ps1 -ApiUrl "http://127.0.0.1:3333"
```

**Importante:** `127.0.0.1:3333` só funciona quando o coletor roda na mesma máquina que a API, ou quando existe um túnel SSH que encaminha essa porta. Para outros servidores, estabeleça uma conexão privada com encaminhamento de portas (SSH/VPN), ou publique a API por **HTTPS com acesso restrito**. O script não permite enviar o token para uma URL HTTP remota.

A coleta não exige permissão de escrita nos serviços. Execute PowerShell com privilégios de leitura suficientes para consultar os sockets e processos. Não armazene o token em repositórios, histórico de comandos compartilhados ou arquivos públicos. Para produção, prefira uma variável de ambiente protegida / gerenciador de segredos e agendamento com conta de serviço. O script atualmente executa **uma coleta por chamada**, sem agendamento automático.

A tela **Portas** mostra as observações, processo, PID, endereço e data de coleta. A sugestão de portas combina reservas e snapshots com menos de cinco minutos; se a coleta estiver antiga, retorna à consulta das reservas e informa que não há leitura recente. A coleta é uma fotografia temporal e não garante a disponibilidade no momento do bind.

Novas rotas administrativas: `POST /api/servers/:id/agent-token`, `DELETE /api/servers/:id/agent-token`, `GET /api/ports/observed` e `GET /api/servers/scan-status`. O coletor envia para `POST /api/agents/report` usando `X-Agent-Token`.

## API e limitações

`GET /api/health` é público. Os demais endpoints exigem `Authorization: Bearer ADMIN_API_TOKEN`.

- `GET/POST /api/servers`; `DELETE /api/servers/:id`
- `GET/POST /api/applications`; `DELETE /api/applications/:id`
- `GET /api/ports/reservations`; `POST /api/ports/suggest`
- `POST /api/ports/reservations`; `DELETE /api/ports/reservations/:id`

O token único é provisório: não publique o painel diretamente na internet. O gerenciador de portas consulta somente reservas cadastradas, não sockets reais dos hosts; a descoberta automática e autenticação por usuário continuam planejadas.
