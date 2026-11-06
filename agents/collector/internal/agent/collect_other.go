//go:build !windows && !linux

package agent
import("context";"errors")
func Collect(context.Context)([]Endpoint,error){return nil,errors.New("collector is only implemented for linux and windows")}
