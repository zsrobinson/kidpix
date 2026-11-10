using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
class RuntimeGate {
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi,SetLastError=true)]static extern IntPtr LoadLibraryA(string p);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi,SetLastError=true)]static extern IntPtr GetProcAddress(IntPtr h,string p);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern uint GetModuleFileName(IntPtr h,StringBuilder b,int n);
 [DllImport("kernel32.dll")]static extern bool FreeLibrary(IntPtr h);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate short Init(uint flags);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate short Enter();
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate void Done();
 static Dictionary<string,object> report=new Dictionary<string,object>();
 static IntPtr Load(string path,string id){IntPtr h=LoadLibraryA(path);int error=h==IntPtr.Zero?Marshal.GetLastWin32Error():0;var b=new StringBuilder(2048);if(h!=IntPtr.Zero)GetModuleFileName(h,b,b.Capacity);report[id]=new{requested=path,loaded=h!=IntPtr.Zero,nativeError=error,actual=b.ToString()};if(h==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(error);if(!String.Equals(path,b.ToString(),StringComparison.OrdinalIgnoreCase)){FreeLibrary(h);throw new InvalidOperationException("Loaded path mismatch");}return h;}
 static IntPtr Export(IntPtr h,string name){IntPtr p=GetProcAddress(h,name);report[name]=new{present=p!=IntPtr.Zero,nativeError=p==IntPtr.Zero?Marshal.GetLastWin32Error():0};if(p==IntPtr.Zero)throw new MissingMethodException(name);return p;}
 static int Main(string[] a){int code=2;IntPtr qts=IntPtr.Zero,client=IntPtr.Zero;bool initialized=false,movies=false;Done exit=null,terminate=null;
 try{
 report["scope"]="Separate prerequisite only; normal full-path LoadLibraryA with trusted installer PATH; external QTMLClient flags2 is not embedded stub";
 qts=Load(Path.Combine(a[0],"QuickTime.qts"),"qts");foreach(string n in new[]{"_CallComponentFunctionWithStorage","_CallComponent","theQuickTimeDispatcher"})Export(qts,n);
 report["qtsFreedBeforeExternalProbe"]=FreeLibrary(qts);qts=IntPtr.Zero;if(!(bool)report["qtsFreedBeforeExternalProbe"])throw new InvalidOperationException("QTS cleanup failed");
 client=Load(Path.Combine(a[0],"QTMLClient.dll"),"client");
 var init=(Init)Marshal.GetDelegateForFunctionPointer(Export(client,"InitializeQTML"),typeof(Init));var enter=(Enter)Marshal.GetDelegateForFunctionPointer(Export(client,"EnterMovies"),typeof(Enter));
 exit=(Done)Marshal.GetDelegateForFunctionPointer(Export(client,"ExitMovies"),typeof(Done));terminate=(Done)Marshal.GetDelegateForFunctionPointer(Export(client,"TerminateQTML"),typeof(Done));
 short q=init(2);initialized=q==0;report["flags"]=2;report["InitializeQTML"]=q;if(!initialized)throw new InvalidOperationException("External initialization failed");short m=enter();movies=m==0;report["EnterMovies"]=m;if(!movies)throw new InvalidOperationException("EnterMovies failed");
 var modules=new List<object>();foreach(ProcessModule module in Process.GetCurrentProcess().Modules)if(module.FileName.StartsWith(a[0]+"\\",StringComparison.OrdinalIgnoreCase))modules.Add(new{path=module.FileName,version=module.FileVersionInfo.FileVersion});report["loadedQuickTimeModules"]=modules;code=0;
 }catch(Exception e){report["error"]=e.GetType().Name;report["message"]=e.Message;}
 finally{try{if(movies){exit();report["ExitMoviesCalled"]=true;}}finally{try{if(initialized){terminate();report["TerminateQTMLCalled"]=true;}}finally{if(client!=IntPtr.Zero){bool freed=FreeLibrary(client);report["clientFreed"]=freed;if(!freed)code=2;}if(qts!=IntPtr.Zero)report["qtsFreed"]=FreeLibrary(qts);File.WriteAllText(a[1],new JavaScriptSerializer().Serialize(report));}}}return code;}
}
