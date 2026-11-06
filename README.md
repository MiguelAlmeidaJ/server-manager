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

## API e limitações

`GET /api/health` é público. Os demais endpoints exigem `Authorization: Bearer ADMIN_API_TOKEN`.

- `GET/POST /api/servers`; `DELETE /api/servers/:id`
- `GET/POST /api/applications`; `DELETE /api/applications/:id`
- `GET /api/ports/reservations`; `POST /api/ports/suggest`
- `POST /api/ports/reservations`; `DELETE /api/ports/reservations/:id`

O token único é provisório: não publique o painel diretamente na internet. O gerenciador de portas consulta somente reservas cadastradas, não sockets reais dos hosts; a descoberta automática e autenticação por usuário continuam planejadas.
