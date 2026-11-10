using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Web.Script.Serialization;
using Microsoft.Win32;
// Read-only x86 discovery and isolated native API probes; no embedded app code executes.
class Probe {
 static Dictionary<string,object> r=new Dictionary<string,object>();
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi,ExactSpelling=true,SetLastError=true)] static extern IntPtr LoadLibraryA(string p);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi,ExactSpelling=true,SetLastError=true)] static extern IntPtr GetModuleHandleA(string p);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi,ExactSpelling=true,SetLastError=true)] static extern uint GetModuleFileNameA(IntPtr h,StringBuilder p,int n);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi,ExactSpelling=true)] static extern uint GetSystemDirectoryA(StringBuilder p,int n);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool SetDllDirectory(string p);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi,ExactSpelling=true,SetLastError=true)] static extern IntPtr GetProcAddress(IntPtr h,string p);
 [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr h);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr p,uint a,out IntPtr t);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr t,int c,IntPtr b,int n,out int needed);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate short Init(uint flags);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate short Enter();
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Done();
 static T Api<T>(IntPtr h,string n) where T:class {IntPtr a=GetProcAddress(h,n); if(a==IntPtr.Zero)throw new EntryPointNotFoundException(n);return Marshal.GetDelegateForFunctionPointer(a,typeof(T)) as T;}
 static string Module(IntPtr h){var b=new StringBuilder(1024);return GetModuleFileNameA(h,b,b.Capacity)>0?b.ToString():null;}
 static int TokenInt(IntPtr t,int c){IntPtr b=Marshal.AllocHGlobal(4);try{int n;if(!GetTokenInformation(t,c,b,4,out n))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());return Marshal.ReadInt32(b);}finally{Marshal.FreeHGlobal(b);}}
 static void Token(){IntPtr t;if(!OpenProcessToken(Process.GetCurrentProcess().Handle,8,out t))throw new System.ComponentModel.Win32Exception();try{r["elevationType"]=TokenInt(t,18);r["elevated"]=TokenInt(t,20);r["elevationTypeName"]=(int)r["elevationType"]==1?"Default":((int)r["elevationType"]==2?"Full":"Limited");int n;GetTokenInformation(t,25,IntPtr.Zero,0,out n);IntPtr b=Marshal.AllocHGlobal(n);try{if(!GetTokenInformation(t,25,b,n,out n))throw new System.ComponentModel.Win32Exception();r["integrity"]=new SecurityIdentifier(Marshal.ReadIntPtr(b)).Value;}finally{Marshal.FreeHGlobal(b);}r["verifiedStandardUser"]=false;}finally{CloseHandle(t);}}
 static string Discover(){
  IntPtr loaded=GetModuleHandleA("QuickTime.qts");r["alreadyLoadedQts"]=loaded!=IntPtr.Zero;
  string chosen=loaded==IntPtr.Zero?null:Path.GetDirectoryName(Module(loaded));
  var rows=new List<object>();
  using(var root=RegistryKey.OpenBaseKey(RegistryHive.LocalMachine,RegistryView.Registry32))
  using(var key=root.OpenSubKey(@"Software\Apple Computer, Inc.\QuickTime",false)){
   r["registryKeyExists"]=key!=null;
   foreach(string name in new[]{"QTSysDir","QuickTime.qts folder","InstallDir"}){
    object v=key==null?null:key.GetValue(name,null,RegistryValueOptions.DoNotExpandEnvironmentNames);
    string value=v as string; bool valid=value!=null&&Path.IsPathRooted(value)&&Directory.Exists(value);
    rows.Add(new{name=name,type=v==null?null:key.GetValueKind(name).ToString(),value=v,directoryExists=valid,qtsExists=valid&&File.Exists(Path.Combine(value,"QuickTime.qts"))});
    if(chosen==null && name!="InstallDir" && valid) {chosen=value;r["discoverySource"]=name;}
   }
  }
  r["registryValues"]=rows;
  var sys=new StringBuilder(1024);GetSystemDirectoryA(sys,sys.Capacity);r["systemDirectory"]=sys.ToString();
  if(chosen==null){chosen=sys.ToString();r["discoverySource"]="systemDirectoryFallback";}
  r["discoveredDirectory"]=chosen;
  r["scope"]="Discovery order and full-path LoadLibraryA probe; not binary-equivalent embedded stub or fallback implementation";
  return chosen;
 }
 static void Modules(){var modules=new List<object>();foreach(ProcessModule m in Process.GetCurrentProcess().Modules){string p=m.FileName;if(p.IndexOf("QuickTime",StringComparison.OrdinalIgnoreCase)>=0||p.IndexOf("Apple Application Support",StringComparison.OrdinalIgnoreCase)>=0)modules.Add(new{path=p,version=m.FileVersionInfo.FileVersion});}r["loadedProductModules"]=modules;}
 static int Main(string[] a){IntPtr h=IntPtr.Zero;bool init=false,movies=false,forced=false;int code=0;
 try{r["bits"]=IntPtr.Size*8;Token();r["mode"]=a[0];if(a[0]=="qtml")r["flags"]=uint.Parse(a[3]);string dir=Discover();
  if(a[0]=="inventory")return 0;
  forced=a[1]=="forcedDirectory";r["searchMode"]=a[1];r["pathMode"]=a[2];
  if(forced&&!SetDllDirectory(dir))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  string target=Path.Combine(dir,a[0]=="qts"?"QuickTime.qts":"QTMLClient.dll");r["requestedLoadPath"]=target;r["targetExists"]=File.Exists(target);
  h=LoadLibraryA(target);int error=h==IntPtr.Zero?Marshal.GetLastWin32Error():0;r["loadSucceeded"]=h!=IntPtr.Zero;r["loadWin32Error"]=error;
  if(h==IntPtr.Zero)return 0;
  r["loadedPath"]=Module(h);
  if(a[0]=="qts") {var exports=new List<object>();foreach(string n in new[]{"_CallComponentFunctionWithStorage","_CallComponent","theQuickTimeDispatcher"}){IntPtr p=GetProcAddress(h,n);int e=p==IntPtr.Zero?Marshal.GetLastWin32Error():0;exports.Add(new{name=n,present=p!=IntPtr.Zero,win32Error=e});}r["requiredExports"]=exports;}
  else {uint flags=uint.Parse(a[3]);r["flags"]=flags;r["apiScope"]="External QTMLClient API; not application embedded dispatcher stub";short result=Api<Init>(h,"InitializeQTML")(flags);r["InitializeQTML"]=result;init=result==0;if(init){short e=Api<Enter>(h,"EnterMovies")();r["EnterMovies"]=e;movies=e==0;}}
  Modules();
 }catch(Exception e){r["errorType"]=e.GetType().FullName;r["hresult"]=e.HResult;code=2;}
 finally {try{if(movies){Api<Done>(h,"ExitMovies")();r["ExitMoviesCalled"]=true;}}finally{try{if(init){Api<Done>(h,"TerminateQTML")();r["TerminateQTMLCalled"]=true;}}finally{if(h!=IntPtr.Zero)r["FreeLibrarySucceeded"]=FreeLibrary(h);if(forced)r["SetDllDirectoryReset"]=SetDllDirectory(null);File.WriteAllText(a[a.Length-1],new JavaScriptSerializer().Serialize(r));}}}
 return code;
 }
}
