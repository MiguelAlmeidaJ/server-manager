package main

import (
"context"
"flag"
"log"
"os"
"os/signal"
"syscall"
"github.com/MiguelAlmeidaJ/server-manager/agents/collector/internal/agent"
)
func main(){
configPath:=flag.String("config","config.json","Path to JSON agent configuration")
once:=flag.Bool("once",false,"Collect and send a single snapshot, then exit")
flag.Parse()
cfg,err:=agent.LoadConfig(*configPath)
if err!=nil{log.Fatalf("configuration: %v",err)}
runner:=func(ctx context.Context){
if *once {if err:=agent.CollectAndSend(ctx,cfg);err!=nil{log.Printf("collection failed: %v",err)};return}
agent.Run(ctx,cfg)
}
if *once{runner(context.Background());return}
ctx,stop:=signal.NotifyContext(context.Background(),os.Interrupt,syscall.SIGTERM)
defer stop()
if err:=runAsService(ctx,runner);err!=nil{log.Fatalf("service: %v",err)}
}
