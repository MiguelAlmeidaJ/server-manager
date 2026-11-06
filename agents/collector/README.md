# DevOps Manager Agent — beta

Agente leve de inventário TCP/UDP. Um executável Go para Windows e Linux que envia snapshots autenticados ao ServerMap a cada 60 segundos (intervalo configurável: 30 a 3600 segundos). O nome do serviço é **devops_manager** em ambos os sistemas.

## Compilação

Com Go 1.23 ou superior, entre em `agents/collector` e execute:

```bash
go test ./...
go build -trimpath -ldflags="-s -w" -o devops_manager ./cmd/devops_manager
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o devops_manager.exe ./cmd/devops_manager
```

No Windows, use apenas `go build -trimpath -ldflags="-s -w" -o devops_manager.exe ./cmd/devops_manager` no PowerShell. Também existe um workflow GitHub Actions em `.github/workflows/agent-build.yml` que compila os dois sistemas e disponibiliza arquivos de build como artifacts.

## Configuração

No painel ServerMap, na aba **Portas**, selecione o servidor já cadastrado e clique **Gerar token**. Guarde o UUID do servidor e o token gerado (64 caracteres). Cada servidor requer um token próprio, revogável.

Copie `config.example.json` como `config.json`:

```json
{
  "apiUrl": "https://servermap.example.com",
  "serverId": "UUID-DO-SERVIDOR",
  "token": "TOKEN-GERADO-PARA-ESTE-SERVIDOR",
  "intervalSeconds": 60
}
```

Use **HTTPS** para servidores remotos. Para um serviço e uma API no mesmo host ou acessível por túnel local, use `http://127.0.0.1:3333`. A API fica em localhost na configuração PM2 atual; para agentes remotos, será necessário um endereço HTTPS protegido ou VPN/túnel estável. Nunca abra a API diretamente à internet por HTTP.

**Teste antes de instalar:** `./devops_manager --config ./config.json --once` (Linux) ou `.\devops_manager.exe --config .\config.json --once` (PowerShell).

## Instalação no Windows

Execute um PowerShell **como Administrador**, no diretório `agents/collector`:

```powershell
.\install\windows\install.ps1 -Binary .\devops_manager.exe -Config .\config.json
Get-Service devops_manager
```

O instalador copia o executável para `C:\Program Files\DevOpsManager\`, salva a configuração em `C:\ProgramData\DevOpsManager\config.json` com ACL restrita a SYSTEM e Administrators, e cria um serviço Windows de inicialização automática. O agente roda pelo Service Control Manager, sem janela de PowerShell, Docker ou PM2. Para atualizar, repita o instalador com um executável novo. Desinstale com `install\windows\uninstall.ps1` em PowerShell elevado.

## Instalação no Linux

```bash
sudo bash install/linux/install.sh ./devops_manager ./config.json
systemctl status devops_manager
journalctl -u devops_manager -n 50 --no-pager
```

O serviço systemd executa como usuário restrito `devops_manager`. A coleta de portas usa `/proc/net/tcp*` e `/proc/net/udp*`; a associação a PID/nome depende de permissão de leitura em `/proc/<pid>/fd`. Quando o usuário não tem permissão, os sockets aparecem sem PID/nome, mas continuam registrados. Desinstale o serviço via `sudo bash install/linux/uninstall.sh`, preservando o binário e a configuração até remoção manual.

## Limites desta versão

- Monitoramento **somente leitura** de portas TCP em LISTEN e endpoints UDP associados ao host, com nome do processo/PID quando legíveis.
- Não escaneia outras máquinas, não abre portas, não modifica serviços nem acessa o socket Docker.
- O sistema salva snapshots completos. Se a coleta falhar, não substitui as observações anteriores por um inventário parcialmente vazio.
- A API considera recentes as observações enviadas nos últimos cinco minutos; isso não garante que uma porta esteja livre no instante do deploy.
- O serviço coleta e transmite em intervalos, sem servidor HTTP embutido nem conexão de entrada.
