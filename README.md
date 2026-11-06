# ServerMap (beta)

Painel para inventário manual de servidores/aplicações e reserva de portas. Stack: React + Vite, Fastify, PostgreSQL, pnpm e Docker Compose.

## Iniciar

1. Copie `.env.example` para `.env`, altere `POSTGRES_PASSWORD` e use token aleatório com no mínimo 32 caracteres em `ADMIN_API_TOKEN`.
2. Execute `docker compose up -d --build`.
3. Abra http://localhost:8080 e informe o token.

A interface fica vinculada a `127.0.0.1:8080`. Para acessar remotamente use túnel SSH. Não publique este MVP na internet: o token único é autenticação provisória.

## API

O cabeçalho obrigatório é `Authorization: Bearer SEU_TOKEN` (exceto `GET /api/health`).
`GET/POST /api/servers`, `DELETE /api/servers/:id`;
`GET/POST /api/applications`, `DELETE /api/applications/:id`;
`GET /api/ports/reservations`, `POST /api/ports/suggest`, `POST /api/ports/reservations`, `DELETE /api/ports/reservations/:id`.

## Limitações do MVP

A reserva é protegida por transação e bloqueio no PostgreSQL. A sugestão de porta considera **somente reservas do ServerMap**, não sockets do sistema operacional. Bind real, Docker, descoberta Linux/Windows, login por usuário, RBAC, auditoria e monitoramento estão pendentes. O esquema inicial é criado na inicialização da API; migrations versionadas serão adicionadas no próximo ciclo.

## Desenvolvimento

`corepack enable && pnpm install`. Configure `DATABASE_URL` e `ADMIN_API_TOKEN` nas variáveis de ambiente do shell; `pnpm dev`. O arquivo `.env` não é carregado automaticamente ao rodar sem Docker.
