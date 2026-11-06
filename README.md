# ServerMap (beta)

Painel privado de inventário manual de servidores, aplicações e reservas de portas.

## Arquitetura

- **Web:** React/Vite (compilado), servidor HTTP Node.js sob `pm2-runtime`, em container Docker.
- **API:** Fastify sob `pm2-runtime`, em outro container Docker.
- **PostgreSQL:** container Docker isolado, sem portas publicadas no host.
- **Rede `application`:** somente web e API.
- **Rede `database`:** somente API e PostgreSQL, com `internal: true`.

A Web é o único serviço publicado no host, em **`127.0.0.1:8080`**. A API atende em `api:3333` e o PostgreSQL em `postgres:5432`, usando nomes DNS internos do Docker. **Não é necessário publicar 5434 nem 5432 no host.**

## Primeira execução

Requisitos: Docker Engine e Docker Compose.

```bash
git clone -b beta https://github.com/MiguelAlmeidaJ/server-manager.git
cd server-manager
cp .env.example .env
```

Edite `.env`, substitua `POSTGRES_PASSWORD` por uma senha forte compatível com URI (ou seja, use caracteres não reservados), e configure `ADMIN_API_TOKEN` com uma string aleatória de 32+ caracteres. Mantenha `.env` fora do Git.

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api web
```

Abra `http://127.0.0.1:8080` na máquina que executa o Docker. Para acesso remoto via SSH:

```bash
ssh -L 8080:127.0.0.1:8080 usuario@servidor
```

**Ambos web e API usam PM2 dentro de seus containers**. Para inspecionar:

```bash
docker compose exec web pm2 list
docker compose exec api pm2 list
docker compose logs -f web api
```

Use `docker compose restart web api` para reiniciar e `docker compose up -d --build` para atualizar. Não é necessário instalar PM2 globalmente no host.

## Migração da versão anterior (PM2 no host + banco publicado)

Se os processos antigos estiverem ativos no host, pare-os **antes** de subir a versão nova:

```bash
pm2 delete servermap-web servermap-api
pm2 save
```

Depois execute `docker compose up -d --build`. A alteração remove o mapeamento de porta do banco, mas preserva o volume nomeado `pgdata`. **Não execute `docker compose down -v`**, pois isso apaga os dados do volume. Se o volume for antigo, mantenha a senha já configurada ou faça uma alteração de senha apropriada no PostgreSQL.

## API

`GET /api/health` é público. As outras rotas exigem `Authorization: Bearer ADMIN_API_TOKEN`.

- `GET/POST /api/servers`; `DELETE /api/servers/:id`
- `GET/POST /api/applications`; `DELETE /api/applications/:id`
- `GET /api/ports/reservations`
- `POST /api/ports/suggest`; `POST /api/ports/reservations`; `DELETE /api/ports/reservations/:id`

## Limitações e segurança

O login atual usa um token administrativo único provisório. **Não exponha o MVP diretamente à internet**. O bind do host fica limitado a localhost; caso precise acesso remoto, use túnel SSH ou proxy HTTPS autenticado.

O gerenciamento de portas considera somente reservas registradas na aplicação; ainda não consulta sockets ou containers reais. Coleta Linux/Windows, autenticação individual, auditoria e detecção automática serão implementadas depois.

A configuração antiga de PM2 no host foi substituída pelo `pm2-runtime` dentro dos containers. O arquivo `ecosystem.config.cjs` legado não faz mais parte do modo de execução suportado.
