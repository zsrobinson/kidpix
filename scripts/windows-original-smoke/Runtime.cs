using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
class RuntimeGate {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool SetDllDirectory(string p);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr LoadLibrary(string p);
 [DllImport("QTMLClient.dll",CallingConvention=CallingConvention.Cdecl)]static extern short InitializeQTML(uint flags);
 [DllImport("QTMLClient.dll",CallingConvention=CallingConvention.Cdecl)]static extern short EnterMovies();
 [DllImport("QTMLClient.dll",CallingConvention=CallingConvention.Cdecl)]static extern void ExitMovies();
 [DllImport("QTMLClient.dll",CallingConvention=CallingConvention.Cdecl)]static extern void TerminateQTML();
 static int Main(string[] a){object report;int code=2;try{SetDllDirectory(a[0]);var h=LoadLibrary(Path.Combine(a[0],"QTMLClient.dll"));if(h==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());int q=InitializeQTML(0);short m=-1;if(q==0){m=EnterMovies();if(m==0)ExitMovies();TerminateQTML();}report=new{clr=Environment.Version.ToString(),bits=IntPtr.Size*8,InitializeQTML=q,EnterMovies=m};code=q==0&&m==0?0:2;}catch(Exception e){var w=e as System.ComponentModel.Win32Exception;report=new{error=e.GetType().Name,hresult=e.HResult,nativeError=w==null?0:w.NativeErrorCode};}File.WriteAllText(a[1],new JavaScriptSerializer().Serialize(report));return code;}
}
