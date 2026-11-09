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
 [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr w);
 [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr w,IntPtr dc);
 [DllImport("gdi32.dll")] static extern int ChoosePixelFormat(IntPtr dc,byte[] pfd);
 [DllImport("gdi32.dll")] static extern bool SetPixelFormat(IntPtr dc,int format,byte[] pfd);
 [DllImport("opengl32.dll")] static extern IntPtr wglCreateContext(IntPtr dc);
 [DllImport("opengl32.dll")] static extern bool wglMakeCurrent(IntPtr dc,IntPtr rc);
 [DllImport("opengl32.dll")] static extern bool wglDeleteContext(IntPtr rc);
 [DllImport("opengl32.dll")] static extern IntPtr glGetString(uint name);
 static void Renderer(IntPtr window) {
  IntPtr dc=GetDC(window), rc=IntPtr.Zero;
  try { byte[] pfd=new byte[40]; pfd[0]=40;pfd[2]=1;pfd[4]=36;pfd[9]=24;pfd[23]=24; int format=ChoosePixelFormat(dc,pfd);
   if(format==0||!SetPixelFormat(dc,format,pfd)) {report["rendererBlocker"]="Pixel format unavailable";return;}
   rc=wglCreateContext(dc); if(rc==IntPtr.Zero||!wglMakeCurrent(dc,rc)) {report["rendererBlocker"]="OpenGL context unavailable";return;}
   report["helperOpenGL"]=new {vendor=Marshal.PtrToStringAnsi(glGetString(0x1F00)),renderer=Marshal.PtrToStringAnsi(glGetString(0x1F01)),version=Marshal.PtrToStringAnsi(glGetString(0x1F02))};
  } finally {wglMakeCurrent(IntPtr.Zero,IntPtr.Zero);if(rc!=IntPtr.Zero)wglDeleteContext(rc);ReleaseDC(window,dc);}
 }
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
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct USER_INFO_1 { public string name,password; public uint age,priv; public string home,comment; public uint flags; public string script; }
 [DllImport("Netapi32.dll",CharSet=CharSet.Unicode)] static extern uint NetUserAdd(string server,uint level,ref USER_INFO_1 info,out uint error);
 [DllImport("Netapi32.dll",CharSet=CharSet.Unicode)] static extern uint NetUserDel(string server,string name);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct MEMBER { public string name; }
 [DllImport("Netapi32.dll",CharSet=CharSet.Unicode)] static extern uint NetLocalGroupAddMembers(string server,string group,uint level,ref MEMBER member,uint count);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUPINFO { public int cb; public string reserved,desktop,title; public uint x,y,xSize,ySize,xChars,yChars,fill,flags; public ushort show,reserved2; public IntPtr reservedPtr,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process,thread; public uint pid,tid; }
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessWithLogonW(string user,string domain,string password,uint flags,string app,StringBuilder command,uint creation,IntPtr env,string cwd,ref STARTUPINFO si,out PROCESS_INFORMATION pi);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint ms);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr h,uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("userenv.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool DeleteProfile(string sid,string path,string computer);
 static string Name(IntPtr h) { var b=new StringBuilder(256); int n; return GetUserObjectInformation(h,2,b,512,out n)? b.ToString():"unavailable"; }
 static int TokenInt(IntPtr t,int cls) { IntPtr b=Marshal.AllocHGlobal(16); try { int n; if(!GetTokenInformation(t,cls,b,16,out n)) { int code=Marshal.GetLastWin32Error(); report["failedTokenQueryClass"]=cls; report["failedTokenQueryError"]=code; throw new System.ComponentModel.Win32Exception(code); } return Marshal.ReadInt32(b); } finally { Marshal.FreeHGlobal(b); } }
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
 static void Pump(int ms) { var s=Stopwatch.StartNew(); while(s.ElapsedMilliseconds<ms) { Application.DoEvents(); Thread.Sleep(10); } }
 static void Move(Point p) { SetCursorPos(p.X,p.Y); Pump(60); }
 static void Click(Point p) { Move(p); mouse_event(2,0,0,0,UIntPtr.Zero); Pump(40); mouse_event(4,0,0,0,UIntPtr.Zero); Pump(150); }
 static bool Desktop(string label) {
  report["windowStation"]=Name(GetProcessWindowStation()); report["desktop"]=Name(GetThreadDesktop(GetCurrentThreadId())); IntPtr input=OpenInputDesktop(0,false,1); report["openInputDesktopError"]=input==IntPtr.Zero?Marshal.GetLastWin32Error():0; string inputName=input==IntPtr.Zero?"unavailable":Name(input); report["inputDesktop"]=inputName; if(input!=IntPtr.Zero)CloseDesktop(input);
  var screen=Screen.PrimaryScreen; report["resolution"]=new {width=screen.Bounds.Width,height=screen.Bounds.Height,bits=screen.BitsPerPixel};
  if(Process.GetCurrentProcess().SessionId==0 || inputName!="Default" || (string)report["desktop"]!="Default" || !String.Equals((string)report["windowStation"],"WinSta0",StringComparison.OrdinalIgnoreCase)) { report["desktopBlocker"]="No usable same-session default input desktop"; return false; }
  using(var f=new Form()) using(var canvas=new Bitmap(250,100)) {
   f.Text="Harmless Windows capability probe"; f.StartPosition=FormStartPosition.Manual; f.Location=new Point(30,30); f.ClientSize=new Size(420,290); f.TopMost=true;
   var button=new Button {Text="Click probe",Bounds=new Rectangle(20,20,140,35)}; var text=new TextBox {Bounds=new Rectangle(20,65,250,30)}; var panel=new Panel {Bounds=new Rectangle(20,110,250,100)}; var patch=new Panel {Bounds=new Rectangle(300,110,60,60),BackColor=Color.Lime};
   using(var g=Graphics.FromImage(canvas)) g.Clear(Color.White); bool clicked=false, drawing=false; int moves=0; Point last=Point.Empty;
   button.Click+=(s,e)=>clicked=true; panel.Paint+=(s,e)=>e.Graphics.DrawImageUnscaled(canvas,0,0); panel.MouseDown+=(s,e)=>{drawing=true;last=e.Location;}; panel.MouseUp+=(s,e)=>drawing=false; panel.MouseMove+=(s,e)=>{if(drawing){using(var g=Graphics.FromImage(canvas))using(var pen=new Pen(Color.Red,5))g.DrawLine(pen,last,e.Location);last=e.Location;moves++;panel.Invalidate();}};
   f.Controls.AddRange(new Control[]{button,text,panel,patch}); f.Show(); SetForegroundWindow(f.Handle); Pump(500); using(var g=f.CreateGraphics()) report["dpi"]=new {x=g.DpiX,y=g.DpiY};
   Click(button.PointToScreen(new Point(40,15))); Click(text.PointToScreen(new Point(30,12))); foreach(byte key in new byte[]{0x50,0x52,0x4F,0x42,0x45}) { keybd_event(key,0,0,UIntPtr.Zero);keybd_event(key,0,2,UIntPtr.Zero);Pump(50); }
   Move(panel.PointToScreen(new Point(20,50))); mouse_event(2,0,0,0,UIntPtr.Zero); for(int i=1;i<=15;i++)Move(panel.PointToScreen(new Point(20+i*12,50)));mouse_event(4,0,0,0,UIntPtr.Zero);Pump(300);
   using(var capture=new Bitmap(f.ClientSize.Width,f.ClientSize.Height)) { Point origin=f.PointToScreen(Point.Empty); using(var g=Graphics.FromImage(capture))g.CopyFromScreen(origin,Point.Empty,capture.Size); Color green=capture.GetPixel(330,140), red=capture.GetPixel(120,160); bool pixels=green.G>200&&green.R<30&&red.R>200&&red.G<50; capture.Save(Path.Combine(output,label+".png")); bool pass=clicked&&text.Text.ToLowerInvariant()=="probe"&&moves>=10&&pixels&&screen.Bounds.Width>=1024&&screen.Bounds.Height>=768&&screen.BitsPerPixel==32;
    report["gui"]=new {click=clicked,text=text.Text,strokeMoves=moves,green=green.ToArgb(),red=red.ToArgb(),knownPixels=pixels,pass=pass}; if(pass)Renderer(f.Handle); f.Close(); return pass;
   }
  }
 }
 static void Save(string file) { File.WriteAllText(Path.Combine(output,file),new JavaScriptSerializer().Serialize(report)); }
 static void StandardChild() {
  string user="kp"+Guid.NewGuid().ToString("N").Substring(0,12); string password=null, sid=null; bool created=false; PROCESS_INFORMATION pi=new PROCESS_INFORMATION();
  try {
   byte[] random=new byte[32]; using(var rng=System.Security.Cryptography.RandomNumberGenerator.Create())rng.GetBytes(random); password="Kp!9"+Convert.ToBase64String(random); Array.Clear(random,0,random.Length);
   var info=new USER_INFO_1 {name=user,password=password,priv=1,flags=0x201,comment="Disposable harmless GUI probe"}; uint parameter; uint result=NetUserAdd(null,1,ref info,out parameter); info.password=null; report["accountCreateResult"]=result; if(result!=0)return; created=true; File.WriteAllText(Path.Combine(output,"owned-account.txt"),user);
   sid=((SecurityIdentifier)new NTAccount(Environment.MachineName,user).Translate(typeof(SecurityIdentifier))).Value;
   string users=((NTAccount)new SecurityIdentifier("S-1-5-32-545").Translate(typeof(NTAccount))).Value; users=users.Substring(users.LastIndexOf('\\')+1); var member=new MEMBER {name=Environment.MachineName+"\\"+user}; result=NetLocalGroupAddMembers(null,users,3,ref member,1); report["usersMembershipResult"]=result; if(result!=0&&result!=1378)return;
   var di=new DirectoryInfo(output); var acl=di.GetAccessControl(); acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.Modify,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow)); di.SetAccessControl(acl);
   string exe=Path.Combine(output,"Probe.exe"); File.Copy(typeof(Probe).Assembly.Location,exe,true); var si=new STARTUPINFO {cb=Marshal.SizeOf(typeof(STARTUPINFO)),desktop="winsta0\\default"};
   bool started=CreateProcessWithLogonW(user,Environment.MachineName,password,1,exe,new StringBuilder("\""+exe+"\" --child \""+output+"\""),0,IntPtr.Zero,output,ref si,out pi); report["childLaunch"]=started; report["childLaunchError"]=started?0:Marshal.GetLastWin32Error(); password=null; if(!started)return;
   File.WriteAllText(Path.Combine(output,"owned-child.txt"),pi.pid.ToString()); uint wait=WaitForSingleObject(pi.process,45000); report["childWaitResult"]=wait; if(wait!=0)TerminateProcess(pi.process,1);
   report["childReportPresent"]=File.Exists(Path.Combine(output,"child.json"));
  } catch(Exception e) { report["standardUserError"]=e.GetType().Name+":"+e.HResult; }
  finally { password=null; if(pi.process!=IntPtr.Zero){ if(WaitForSingleObject(pi.process,1000)!=0)TerminateProcess(pi.process,1); CloseHandle(pi.process); } if(pi.thread!=IntPtr.Zero)CloseHandle(pi.thread); if(created) { report["profileDelete"]=sid!=null&&DeleteProfile(sid,null,null); report["profileDeleteError"]=Marshal.GetLastWin32Error(); report["accountDeleteResult"]=NetUserDel(null,user); } }
 }
 [STAThread] static int Main(string[] args) {
  bool child=args.Length==2&&args[0]=="--child"; output=child?args[1]:args[0]; Directory.CreateDirectory(output); SetProcessDPIAware();
  try { bool standard=Identity(); if(child&&!standard) { report["blocker"]="Independent child token is not verified standard medium user"; return 2; } if(!child)Audio(); bool desktop=Desktop(child?"child-window":"parent-window"); report["desktopGate"]=desktop; if(!desktop) {report["blocker"]="Harmless desktop/input/screenshot gate failed";return 2;} if(!child)StandardChild(); return 0; }
  catch(Exception e) { report["blocker"]=e.GetType().Name+":"+e.HResult; if(e is System.ComponentModel.Win32Exception) report["nativeErrorCode"]=((System.ComponentModel.Win32Exception)e).NativeErrorCode; return 2; }
  finally { Save(child?"child.json":"parent.json"); }
 }
}
