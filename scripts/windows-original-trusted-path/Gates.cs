using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.AccessControl;
using System.Web.Script.Serialization;

class Probe {
 static Dictionary<string,object> report = new Dictionary<string,object>();
 static string output;
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] static extern IntPtr GetProcessWindowStation();
 [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint id);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("user32.dll", SetLastError=true)] static extern IntPtr OpenInputDesktop(uint f, bool inherit, uint access);
 [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr h,int i,StringBuilder b,int n,out int needed);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 [DllImport("kernel32.dll")] static extern uint WTSGetActiveConsoleSessionId();
 [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr t,int cls,IntPtr b,int n,out int len);
 [DllImport("winmm.dll")] static extern uint waveOutGetNumDevs();
 [DllImport("winmm.dll", CharSet=CharSet.Unicode)] static extern uint waveOutGetDevCaps(UIntPtr id,out WAVEOUTCAPS caps,uint size);
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct WAVEOUTCAPS { public ushort mid,pid; public uint version; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string name; public uint formats; public ushort channels,reserved; public uint support; }
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator {}
 [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator { [PreserveSig] int EnumAudioEndpoints(int flow,uint state,out IMMDeviceCollection devices); }
 [ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-C0A0B089F25E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceCollection { [PreserveSig] int GetCount(out uint count); [PreserveSig] int Item(uint n,out IMMDevice dev); }
 [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice { [PreserveSig] int Activate(ref Guid iid,uint context,IntPtr parameters,out IntPtr result); [PreserveSig] int OpenPropertyStore(uint mode,out IntPtr store); [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id); [PreserveSig] int GetState(out uint state); }
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 static string Name(IntPtr h) { var b=new StringBuilder(256); int n; return GetUserObjectInformation(h,2,b,512,out n)? b.ToString():"unavailable"; }
 static int TokenInt(IntPtr t,int cls) { IntPtr b=Marshal.AllocHGlobal(4); try { int n; if(!GetTokenInformation(t,cls,b,4,out n)) { int code=Marshal.GetLastWin32Error(); report["failedTokenQueryClass"]=cls; report["failedTokenQueryError"]=code; throw new System.ComponentModel.Win32Exception(code); } return Marshal.ReadInt32(b); } finally { Marshal.FreeHGlobal(b); } }
 static bool Identity() {
  using(var id=WindowsIdentity.GetCurrent()) {
  IntPtr t; if(!OpenProcessToken(GetCurrentProcess(),8,out t)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  try {
  report["identity"]=id.Name; report["sid"]=id.User.Value; report["clr"]=Environment.Version.ToString(); report["pointerBits"]=IntPtr.Size*8;
  report["session"]=Process.GetCurrentProcess().SessionId; report["activeConsoleSession"]=WTSGetActiveConsoleSessionId();
  int type=TokenInt(t,8), elevationType=TokenInt(t,18), elevated=TokenInt(t,20); report["tokenType"]=type; report["elevationType"]=elevationType; report["elevated"]=elevated;
  int length; GetTokenInformation(t,25,IntPtr.Zero,0,out length); IntPtr b=Marshal.AllocHGlobal(length); string integrity;
  try { if(!GetTokenInformation(t,25,b,length,out length)) throw new System.ComponentModel.Win32Exception(); integrity=new SecurityIdentifier(Marshal.ReadIntPtr(b)).Value; } finally { Marshal.FreeHGlobal(b); }
  report["integrity"]=integrity;
  GetTokenInformation(t,2,IntPtr.Zero,0,out length); b=Marshal.AllocHGlobal(length); bool admin=false, users=false; var groups=new List<object>();
  try { if(!GetTokenInformation(t,2,b,length,out length)) throw new System.ComponentModel.Win32Exception(); int count=Marshal.ReadInt32(b); int offset=IntPtr.Size==8?8:4; int stride=IntPtr.Size==8?16:8;
   for(int i=0;i<count;i++) { IntPtr item=IntPtr.Add(b,offset+i*stride); var sid=new SecurityIdentifier(Marshal.ReadIntPtr(item)); uint attrs=(uint)Marshal.ReadInt32(item,IntPtr.Size); string name; try { name=sid.Translate(typeof(NTAccount)).Value; } catch { name=sid.Value; } groups.Add(new {sid=sid.Value,name=name,attributes=attrs}); if(sid.Value=="S-1-5-32-544") admin=true; if(sid.Value=="S-1-5-32-545" && (attrs&4)!=0) users=true; }
  } finally { Marshal.FreeHGlobal(b); }
  report["groups"]=groups; bool standard=!admin&&users&&elevated==0&&elevationType!=2&&integrity=="S-1-16-8192"; report["verifiedStandardUser"]=standard; return standard;
  } finally { CloseHandle(t); }
  }
 }
 static void Audio() {
  uint n=waveOutGetNumDevs(); var devices=new List<object>(); for(uint i=0;i<n;i++) { WAVEOUTCAPS c; uint r=waveOutGetDevCaps((UIntPtr)i,out c,(uint)Marshal.SizeOf(typeof(WAVEOUTCAPS))); devices.Add(new {index=i,result=r,name=c.name,channels=c.channels,formats=c.formats}); } report["waveOut"]=devices;
  object enumerator=null; IMMDeviceCollection collection=null;
  try { enumerator=new Enumerator(); int hr=((IMMDeviceEnumerator)enumerator).EnumAudioEndpoints(0,1,out collection); Marshal.ThrowExceptionForHR(hr); uint count; Marshal.ThrowExceptionForHR(collection.GetCount(out count)); var endpoints=new List<object>(); for(uint i=0;i<count;i++) { IMMDevice dev; Marshal.ThrowExceptionForHR(collection.Item(i,out dev)); try { string id; uint state; Marshal.ThrowExceptionForHR(dev.GetId(out id)); Marshal.ThrowExceptionForHR(dev.GetState(out state)); endpoints.Add(new {id=id,state=state}); } finally { Marshal.ReleaseComObject(dev); } } report["activeRenderEndpoints"]=endpoints; report["audioEndpointGate"]=count>0?"AVAILABLE_UNTESTED":"NO";
  } catch(Exception e) { report["audioEndpointError"]=e.GetType().Name+":"+e.HResult; report["audioEndpointGate"]="UNKNOWN"; } finally { if(collection!=null)Marshal.ReleaseComObject(collection); if(enumerator!=null)Marshal.ReleaseComObject(enumerator); }
 }
 static void Save(string file) { File.WriteAllText(Path.Combine(output,file),new JavaScriptSerializer().Serialize(report)); }
 [STAThread] static int Main(string[] args) {
  output=args[0]; Directory.CreateDirectory(output); SetProcessDPIAware();
  try {
   Identity(); Audio();
   report["windowStation"]=Name(GetProcessWindowStation()); report["desktop"]=Name(GetThreadDesktop(GetCurrentThreadId()));
   IntPtr input=OpenInputDesktop(0,false,1); report["inputDesktop"]=input==IntPtr.Zero?"unavailable":Name(input);
   report["inputDesktopError"]=input==IntPtr.Zero?Marshal.GetLastWin32Error():0; if(input!=IntPtr.Zero)CloseDesktop(input);
   report["resolution"]=new {width=Screen.PrimaryScreen.Bounds.Width,height=Screen.PrimaryScreen.Bounds.Height,bits=Screen.PrimaryScreen.BitsPerPixel};
   report["audioProof"]=false; report["originalReferences"]="0/17";
   return 0;
  } catch(Exception e) {report["error"]=e.GetType().FullName;report["hresult"]=e.HResult;var w=e as System.ComponentModel.Win32Exception;if(w!=null)report["nativeError"]=w.NativeErrorCode;return 2;}
  finally {Save("token-desktop.json");}
 }
}
