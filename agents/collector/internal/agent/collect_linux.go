//go:build linux

package agent
import("bufio";"context";"encoding/hex";"fmt";"net";"os";"path/filepath";"strconv";"strings")
type socketRecord struct{endpoint Endpoint;inode string}
func parseIPv4(value string)string{
raw,err:=hex.DecodeString(value);if err!=nil||len(raw)!=4{return "0.0.0.0"}
return net.IPv4(raw[3],raw[2],raw[1],raw[0]).String()
}
func parseIPv6(value string)string{
raw,err:=hex.DecodeString(value);if err!=nil||len(raw)!=16{return "::"}
for i:=0;i<16;i+=4{raw[i],raw[i+3]=raw[i+3],raw[i];raw[i+1],raw[i+2]=raw[i+2],raw[i+1]}
return net.IP(raw).String()
}
func readSockets(path,protocol string,ipv6 bool)([]socketRecord,error){
f,err:=os.Open(path);if err!=nil{if os.IsNotExist(err){return nil,nil};return nil,err};defer f.Close()
scanner:=bufio.NewScanner(f);first:=true
records:=[]socketRecord{}
for scanner.Scan(){
if first{first=false;continue}
fields:=strings.Fields(scanner.Text());if len(fields)<10{continue}
if protocol=="tcp"&&fields[3]!="0A"{continue}
parts:=strings.Split(fields[1],":");if len(parts)!=2{continue}
n,err:=strconv.ParseUint(parts[1],16,16);if err!=nil||n==0{continue}
addr:=parseIPv4(parts[0]);if ipv6{addr=parseIPv6(parts[0])}
state:="BOUND";if protocol=="tcp"{state="LISTEN"}
records=append(records,socketRecord{endpoint:Endpoint{Port:int(n),Protocol:protocol,BindAddress:addr,State:state},inode:fields[9]})
}
return records,scanner.Err()
}
func Collect(ctx context.Context)([]Endpoint,error){
sources:=[]struct{file,protocol string;v6 bool}{
{"/proc/net/tcp","tcp",false},{"/proc/net/tcp6","tcp",true},
{"/proc/net/udp","udp",false},{"/proc/net/udp6","udp",true},
}
var records []socketRecord
for _,source:=range sources{
select{case <-ctx.Done():return nil,ctx.Err();default:}
found,err:=readSockets(source.file,source.protocol,source.v6);if err!=nil{return nil,fmt.Errorf("%s: %w",source.file,err)}
records=append(records,found...)
}
inodeToIndex:=make(map[string][]int)
for i,rec:=range records{inodeToIndex[rec.inode]=append(inodeToIndex[rec.inode],i)}
entries,err:=os.ReadDir("/proc");if err!=nil{return nil,err}
for _,entry:=range entries{
select{case <-ctx.Done():return nil,ctx.Err();default:}
pid,err:=strconv.Atoi(entry.Name());if err!=nil{continue}
comm,err:=os.ReadFile(filepath.Join("/proc",entry.Name(),"comm"));if err!=nil{continue}
fds,err:=os.ReadDir(filepath.Join("/proc",entry.Name(),"fd"));if err!=nil{continue}
for _,fd:=range fds{
target,err:=os.Readlink(filepath.Join("/proc",entry.Name(),"fd",fd.Name()));if err!=nil||!strings.HasPrefix(target,"socket:["){continue}
inode:=strings.TrimSuffix(strings.TrimPrefix(target,"socket:["),"]")
for _,i:=range inodeToIndex[inode]{
if records[i].endpoint.PID==nil{p:=pid;name:=strings.TrimSpace(string(comm));records[i].endpoint.PID=&p;records[i].endpoint.ProcessName=&name}
}
}
}
result:=make([]Endpoint,0,len(records));seen:=make(map[string]struct{})
for _,r:=range records{
key:=fmt.Sprintf("%s|%s|%d",r.endpoint.Protocol,r.endpoint.BindAddress,r.endpoint.Port)
if _,ok:=seen[key];ok{continue};seen[key]=struct{}{}
result=append(result,r.endpoint)
}
return result,nil
}
