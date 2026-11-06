//go:build linux

package agent
import "testing"
func TestIPv4LittleEndian(t *testing.T){if got:=parseIPv4("0100007F");got!="127.0.0.1"{t.Fatalf("got %q",got)}}
func TestIPv6LittleEndian(t *testing.T){if got:=parseIPv6("00000000000000000000000001000000");got!="::1"{t.Fatalf("got %q",got)}}
