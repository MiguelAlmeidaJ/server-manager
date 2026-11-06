package agent
import("os";"path/filepath";"strings";"testing")
func writeConfig(t *testing.T,apiURL string)string{
t.Helper();p:=filepath.Join(t.TempDir(),"config.json")
body:=`{"apiUrl":"`+apiURL+`","serverId":"00000000-0000-4000-8000-000000000000","token":"`+strings.Repeat("a",64)+`","intervalSeconds":60}`
if err:=os.WriteFile(p,[]byte(body),0600);err!=nil{t.Fatal(err)}
return p
}
func TestConfigRequiresHTTPSForRemote(t *testing.T){
if _,err:=LoadConfig(writeConfig(t,"http://example.com"));err==nil{t.Fatal("remote HTTP accepted")}
if _,err:=LoadConfig(writeConfig(t,"https://example.com"));err!=nil{t.Fatal(err)}
if _,err:=LoadConfig(writeConfig(t,"http://127.0.0.1:3333"));err!=nil{t.Fatal(err)}
}
func TestConfigRejectsCredentials(t *testing.T){
if _,err:=LoadConfig(writeConfig(t,"https://abc:secret@example.com"));err==nil{t.Fatal("embedded credentials accepted")}
}
