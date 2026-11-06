//go:build windows

package agent
import("context";"encoding/csv";"fmt";"os/exec";"strconv";"strings")
func windowsProcesses(ctx context.Context)map[int]string{
cmd:=exec.CommandContext(ctx,"tasklist.exe","/FO","CSV","/NH")
b,err:=cmd.Output();if err!=nil{return map[int]string{}}
reader:=csv.NewReader(strings.NewReader(string(b)));rows,err:=reader.ReadAll();if err!=nil{return map[int]string{}}
found:=map[int]string{}
for _,row:=range rows{if len(row)<2{continue};pid,err:=strconv.Atoi(strings.ReplaceAll(row[1],",",""));if err==nil{found[pid]=row[0]}}
return found
}
func Collect(ctx context.Context)([]Endpoint,error){
names:=windowsProcesses(ctx)
result:=[]Endpoint{};seen:=map[string]struct{}{}
for _,protocol:=range []string{"tcp","udp"}{
cmd:=exec.CommandContext(ctx,"netstat.exe","-ano","-p",protocol)
output,err:=cmd.Output();if err!=nil{return nil,fmt.Errorf("netstat %s: %w",protocol,err)}
for _,line:=range strings.Split(string(output),"\n"){
fields:=strings.Fields(line);if len(fields)<4||strings.ToLower(fields[0])!=protocol{continue}
if protocol=="tcp"&&(len(fields)<5||!strings.EqualFold(fields[3],"LISTENING")){continue}
local:=fields[1];cut:=strings.LastIndex(local,":");if cut<1{continue}
port,err:=strconv.Atoi(local[cut+1:]);if err!=nil||port<1||port>65535{continue}
address:=strings.Trim(local[:cut],"[]");if address=="*"{address="0.0.0.0"}
pid,err:=strconv.Atoi(fields[len(fields)-1]);if err!=nil{continue}
key:=fmt.Sprintf("%s|%s|%d",protocol,address,port);if _,ok:=seen[key];ok{continue};seen[key]=struct{}{}
state:="BOUND";if protocol=="tcp"{state="LISTEN"}
item:=Endpoint{Protocol:protocol,BindAddress:address,Port:port,PID:&pid,State:state}
if name,exists:=names[pid];exists{item.ProcessName=&name}
result=append(result,item)
}
}
return result,nil
}
