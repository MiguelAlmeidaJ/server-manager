//go:build windows

package main
import("context";"errors";"fmt";"syscall";"unsafe")
const(
serviceWin32OwnProcess=0x00000010
serviceStartPending=0x00000002
serviceStopPending=0x00000003
serviceRunning=0x00000004
serviceStopped=0x00000001
serviceAcceptStop=0x00000001
serviceAcceptShutdown=0x00000004
serviceControlStop=0x00000001
serviceControlShutdown=0x00000005
errorFailedServiceControllerConnect syscall.Errno=1063
)
type serviceStatus struct{
ServiceType uint32
CurrentState uint32
ControlsAccepted uint32
Win32ExitCode uint32
ServiceSpecificExitCode uint32
CheckPoint uint32
WaitHint uint32
}
type serviceTableEntry struct{name *uint16;callback uintptr}
var(
advapi32=syscall.NewLazyDLL("advapi32.dll")
startDispatcher=advapi32.NewProc("StartServiceCtrlDispatcherW")
registerHandler=advapi32.NewProc("RegisterServiceCtrlHandlerW")
setStatus=advapi32.NewProc("SetServiceStatus")
serviceName=syscall.StringToUTF16Ptr("devops_manager")
serviceWork func(context.Context)
serviceCancel context.CancelFunc
serviceDone chan struct{}
serviceHandle uintptr
)
func reportStatus(state,accepts uint32){
current:=serviceStatus{ServiceType:serviceWin32OwnProcess,CurrentState:state,ControlsAccepted:accepts}
if state==serviceStartPending||state==serviceStopPending{current.WaitHint=30000}
_,_,_=setStatus.Call(serviceHandle,uintptr(unsafe.Pointer(&current)))
}
func onServiceControl(code uint32)uintptr{
if code==serviceControlStop||code==serviceControlShutdown{
reportStatus(serviceStopPending,0)
if serviceCancel!=nil{serviceCancel()}
}
return 0
}
func serviceMain(_ uint32,_ uintptr)uintptr{
handle,_,_:=registerHandler.Call(uintptr(unsafe.Pointer(serviceName)),syscall.NewCallback(onServiceControl))
if handle==0{return 0}
serviceHandle=handle
reportStatus(serviceStartPending,0)
ctx,cancel:=context.WithCancel(context.Background())
serviceCancel=cancel
serviceDone=make(chan struct{})
go func(){defer close(serviceDone);serviceWork(ctx)}()
reportStatus(serviceRunning,serviceAcceptStop|serviceAcceptShutdown)
<-serviceDone
cancel()
reportStatus(serviceStopped,0)
return 0
}
func runAsService(ctx context.Context,work func(context.Context))error{
serviceWork=work
table:=[2]serviceTableEntry{{name:serviceName,callback:syscall.NewCallback(serviceMain)},{}}
ok,_,err:=startDispatcher.Call(uintptr(unsafe.Pointer(&table[0])))
if ok!=0{return nil}
if errors.Is(err,errorFailedServiceControllerConnect){work(ctx);return nil}
return fmt.Errorf("StartServiceCtrlDispatcherW: %w",err)
}
