# ServerMap (beta)

Inventário manual de servidores/aplicações e reserva de portas. Frontend React + Vite, backend Fastify, PostgreSQL em Docker; API e frontend são processos Node gerenciados pelo **PM2**.

## Portas

| Serviço | Host | Observação |
| --- | --- | --- |
| PostgreSQL | `127.0.0.1:5434` | Docker mapeia para porta 5432 no container |
| API | `127.0.0.1:3333` | PM2: servermap-api |
| Web | `127.0.0.1:8080` | PM2: servermap-web; proxy de `/api` |

## Instalação (Linux com Node.js 22+, Docker e pnpm)

```bash
git clone -b beta https://github.com/MiguelAlmeidaJ/server-manager.git
cd server-manager
cp .env.example .env
```

Edite `.env`: altere `POSTGRES_PASSWORD`, coloque a **mesma senha** no campo de senha de `DATABASE_URL`, e gere um `ADMIN_API_TOKEN` longo e aleatório (32+ caracteres). Se a senha tiver caracteres especiais, use URL encoding em `DATABASE_URL`. Não versione o `.env`.

```bash
docker compose up -d postgres
corepack enable
pnpm install
pnpm build
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 status
```

Acesse `http://127.0.0.1:8080` na máquina do processo, informe o token. Para acesso remoto, use túnel SSH:

```bash
ssh -L 8080:127.0.0.1:8080 usuario@seu-servidor
```

Se já usava a versão anterior com containers web e api:

```bash
docker compose stop web api
docker compose rm -f web api
docker compose up -d postgres
```

A alteração para a porta 5434 só afeta a porta publicada no host. O PostgreSQL continua na 5432 interna do container.

## Operação PM2

```bash
pm2 logs servermap-api
pm2 logs servermap-web
pm2 restart ecosystem.config.cjs --update-env
pm2 save
```

Para configurar inicialização no boot, rode `pm2 startup` e execute o comando que ele imprimir, depois `pm2 save`. Execute PM2 com um usuário dedicado, sem privilégios de root sempre que possível.

## API

`GET /api/health` é público. Outros endpoints requerem `Authorization: Bearer ADMIN_API_TOKEN`.

`GET/POST /api/servers`, `DELETE /api/servers/:id`;
`GET/POST /api/applications`, `DELETE /api/applications/:id`;
`GET /api/ports/reservations`, `POST /api/ports/suggest`, `POST /api/ports/reservations`, `DELETE /api/ports/reservations/:id`.

## Segurança e limitações

Não exponha o painel publicamente neste estágio: usa um token administrativo único e provisório. Os serviços ficam vinculados a localhost por padrão.

Reservas são protegidas por bloqueio transacional no PostgreSQL, mas sugestões consultam **somente reservas cadastradas**, não portas em uso no sistema operacional. Agentes Windows/Linux, Docker discovery, autenticação individual, RBAC e auditoria serão implementados depois.

## Desenvolvimento local

`pnpm dev` continua disponível; exige `DATABASE_URL` e `ADMIN_API_TOKEN` definidos no shell e banco ligado. O arquivo `.env` não é carregado automaticamente fora do PM2.
