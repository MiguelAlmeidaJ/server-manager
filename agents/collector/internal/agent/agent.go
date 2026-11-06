package agent
import(
"bytes";"context";"encoding/json";"errors";"fmt";"io";"log";"net";"net/http";"net/url";"os";"strings";"time"
)
type Config struct{
APIURL string `json:"apiUrl"`
ServerID string `json:"serverId"`
Token string `json:"token"`
IntervalSeconds int `json:"intervalSeconds"`
}
type Endpoint struct{
Port int `json:"port"`
Protocol string `json:"protocol"`
BindAddress string `json:"bindAddress"`
PID *int `json:"pid,omitempty"`
ProcessName *string `json:"processName,omitempty"`
State string `json:"state"`
}
type report struct{
ServerID string `json:"serverId"`
Hostname string `json:"hostname"`
Ports []Endpoint `json:"ports"`
}
func LoadConfig(path string)(Config,error){
var cfg Config
b,err:=os.ReadFile(path);if err!=nil{return cfg,err}
if err=json.Unmarshal(b,&cfg);err!=nil{return cfg,err}
if cfg.IntervalSeconds==0{cfg.IntervalSeconds=60}
if cfg.IntervalSeconds<30||cfg.IntervalSeconds>3600{return cfg,errors.New("intervalSeconds must be between 30 and 3600")}
if len(cfg.Token)!=64||cfg.ServerID==""{return cfg,errors.New("serverId and 64-character agent token are required")}
for _,c:=range cfg.Token{if !strings.ContainsRune("0123456789abcdefABCDEF",c){return cfg,errors.New("invalid token format")}}
u,err:=url.Parse(cfg.APIURL);if err!=nil{return cfg,err}
if u.User!=nil||u.RawQuery!=""||u.Fragment!=""||u.Host==""{return cfg,errors.New("apiUrl must be a base URL without credentials, query or fragment")}
if u.Scheme!="https"{
name:=u.Hostname();ip:=net.ParseIP(name)
if u.Scheme!="http"||!(name=="localhost"||ip!=nil&&ip.IsLoopback()){return cfg,errors.New("remote API endpoint requires HTTPS; use a secure tunnel for localhost HTTP")}
}
cfg.APIURL=strings.TrimRight(cfg.APIURL,"/")
return cfg,nil
}
func Run(ctx context.Context,cfg Config){
ticker:=time.NewTicker(time.Duration(cfg.IntervalSeconds)*time.Second)
defer ticker.Stop()
for{
if err:=CollectAndSend(ctx,cfg);err!=nil&&ctx.Err()==nil{log.Printf("snapshot send failed: %v",err)}
select{case <-ctx.Done():return;case <-ticker.C:}
}
}
func CollectAndSend(ctx context.Context,cfg Config)error{
ports,err:=Collect(ctx);if err!=nil{return fmt.Errorf("collect: %w",err)}
if len(ports)>15000{return fmt.Errorf("too many endpoints (%d), not sending partial inventory",len(ports))}
hostname,_:=os.Hostname()
payload,err:=json.Marshal(report{ServerID:cfg.ServerID,Hostname:hostname,Ports:ports});if err!=nil{return err}
if len(payload)>2*1024*1024{return errors.New("report exceeds API 2 MiB limit")}
reqCtx,cancel:=context.WithTimeout(ctx,20*time.Second);defer cancel()
req,err:=http.NewRequestWithContext(reqCtx,http.MethodPost,cfg.APIURL+"/api/agents/report",bytes.NewReader(payload));if err!=nil{return err}
req.Header.Set("Content-Type","application/json")
req.Header.Set("X-Agent-Token",cfg.Token)
client:=http.Client{Timeout:20*time.Second,CheckRedirect:func(_ *http.Request,_ []*http.Request)error{return http.ErrUseLastResponse}}
response,err:=client.Do(req);if err!=nil{return err}
defer response.Body.Close()
if response.StatusCode!=http.StatusOK{return fmt.Errorf("API responded with HTTP %d",response.StatusCode)}
_,_=io.Copy(io.Discard,io.LimitReader(response.Body,1024))
log.Printf("snapshot published: %d endpoints",len(ports))
return nil
}
