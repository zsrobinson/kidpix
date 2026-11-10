using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
using System.Web.Script.Serialization;
class Observe {
 [StructLayout(LayoutKind.Sequential)]struct RECT{public int l,t,r,b;}
 [StructLayout(LayoutKind.Sequential)]struct POINT{public int x,y;}
 [DllImport("user32.dll")]static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")]static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 static bool ScreenSafe(IntPtr target,RECT r){
 if(GetForegroundWindow()!=target||!System.Windows.Forms.Screen.PrimaryScreen.Bounds.Contains(Rectangle.FromLTRB(r.l,r.t,r.r,r.b)))return false;
 bool safe=true,found=false;EnumWindows(delegate(IntPtr h,IntPtr unused){if(h==target){found=true;return false;}RECT other;if(IsWindowVisible(h)&&GetWindowRect(h,out other)&&r.l<other.r&&r.r>other.l&&r.t<other.b&&r.b>other.t){safe=false;return false;}return true;},IntPtr.Zero);return safe&&found;
 }
 delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc c,IntPtr p);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out RECT rect);
 [DllImport("user32.dll")]static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")]static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,System.Text.StringBuilder b,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,System.Text.StringBuilder b,int n);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int cls,IntPtr buffer,int size,out int length);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 static object AppToken(Process app){IntPtr token=IntPtr.Zero;try{if(!OpenProcessToken(app.Handle,8,out token))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());var values=new Dictionary<string,object>();foreach(var query in new[]{18,20,25}){int length;if(query==25)GetTokenInformation(token,query,IntPtr.Zero,0,out length);else length=4;IntPtr data=Marshal.AllocHGlobal(length);try{if(!GetTokenInformation(token,query,data,length,out length))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());if(query==25)values["integrity"]=new System.Security.Principal.SecurityIdentifier(Marshal.ReadIntPtr(data)).Value;else values[query==18?"elevationType":"elevated"]=Marshal.ReadInt32(data);}finally{Marshal.FreeHGlobal(data);}}return values;}catch(Exception e){return new{error=e.GetType().Name,hresult=e.HResult};}finally{if(token!=IntPtr.Zero)CloseHandle(token);}}
 static string output;static Stopwatch clock=Stopwatch.StartNew();static List<object> states=new List<object>();static List<object> inputs=new List<object>();
 static void Save(string name,object data){File.WriteAllText(Path.Combine(output,name),new JavaScriptSerializer{MaxJsonLength=1024*1024}.Serialize(data));}
 [STAThread]static int Main(string[] args){output=args[1];SetProcessDPIAware();Process app=null;string outcome="Observed only; inspect owned windows for actual startup state";bool clicked=false;int captures=0;
 try {var si=new ProcessStartInfo(args[0]){WorkingDirectory=Path.GetDirectoryName(args[0]),UseShellExecute=false};app=Process.Start(si);Save("launch.json",new{pid=app.Id,executable=Path.GetFullPath(args[0]),session=app.SessionId,token=AppToken(app),launchCount=1,trustedInheritedPath=Environment.GetEnvironmentVariable("PATH"),utc=DateTime.UtcNow.ToString("o"),elapsedMs=clock.ElapsedMilliseconds});
 // One launch, <=60 seconds of observation, and at most one explicit ordinary trial button.
 for(int frame=0;frame<8;frame++){Thread.Sleep(frame==0?5000:4000);app.Refresh();var windows=new List<object>();var candidates=new List<AutomationElement>();bool blocked=false;
 EnumWindows(delegate(IntPtr h,IntPtr ignored){uint pid;GetWindowThreadProcessId(h,out pid);if(pid!=app.Id||!IsWindowVisible(h))return true;RECT r;if(!GetWindowRect(h,out r))return true;
 var names=new List<string>();var buttons=new List<AutomationElement>();var text=new System.Text.StringBuilder(512);GetWindowText(h,text,text.Capacity);string title=text.ToString();var cls=new System.Text.StringBuilder(256);GetClassName(h,cls,cls.Capacity);
 try{var root=AutomationElement.FromHandle(h);title=root.Current.Name;var all=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);for(int i=0;i<Math.Min(all.Count,200);i++){var e=all[i];string name=e.Current.Name;if(!String.IsNullOrEmpty(name))names.Add(name.Length>300?name.Substring(0,300):name);if(e.Current.ControlType==ControlType.Button)buttons.Add(e);}}catch(Exception e){names.Add("UIA:"+e.GetType().Name+":"+e.HResult);}
 string joined=title+" "+String.Join(" ",names.ToArray());string lower=joined.ToLowerInvariant();if(lower.Contains("eula")||lower.Contains("license agreement")||lower.Contains("licence agreement")||lower.Contains("payment")||lower.Contains("credit card")||lower.Contains("expired")||lower.Contains("elevated")||lower.Contains("activation")||lower.Contains("license key")||lower.Contains("sign in")||lower.Contains("log in")||lower.Contains("serial number")||lower.Contains("registration code")||lower.Contains("administrator")){blocked=true;outcome="Stopped on policy, expiry, activation or login text";}
 string file=null,screenFile=null;bool captured=false,screenSafe=false;RECT client;POINT origin=new POINT();GetClientRect(h,out client);ClientToScreen(h,ref origin);RECT bounds=new RECT{l=origin.x,t=origin.y,r=origin.x+client.r,b=origin.y+client.b};
 if(captures<6&&r.r>r.l&&r.b>r.t&&r.r-r.l<=2048&&r.b-r.t<=1536){file="window-"+frame+"-"+h.ToInt64().ToString("x")+".png";using(var bitmap=new Bitmap(r.r-r.l,r.b-r.t)){using(var g=Graphics.FromImage(bitmap)){IntPtr dc=g.GetHdc();try{captured=PrintWindow(h,dc,0);}finally{g.ReleaseHdc(dc);}}if(captured){bitmap.Save(Path.Combine(output,file),ImageFormat.Png);captures++;}else file=null;}}
 if(captures<6&&bounds.r>bounds.l&&bounds.b>bounds.t&&bounds.r-bounds.l<=2048&&bounds.b-bounds.t<=1536&&(screenSafe=ScreenSafe(h,bounds))){
 using(var bitmap=new Bitmap(bounds.r-bounds.l,bounds.b-bounds.t)){using(var g=Graphics.FromImage(bitmap)){if(ScreenSafe(h,bounds)){g.CopyFromScreen(bounds.l,bounds.t,0,0,bitmap.Size);if(ScreenSafe(h,bounds)){screenFile="window-client-"+frame+"-"+h.ToInt64().ToString("x")+".png";bitmap.Save(Path.Combine(output,screenFile),ImageFormat.Png);captures++;}}}}}
 windows.Add(new{utc=DateTime.UtcNow.ToString("o"),handle=h.ToInt64(),pid=pid,title=title,windowClass=cls.ToString(),left=r.l,top=r.t,width=r.r-r.l,height=r.b-r.t,client=new{left=bounds.l,top=bounds.t,width=client.r,height=client.b},controls=names,capture=file,printWindowSucceeded=captured,screenCapture=screenFile,foregroundAndUnoccluded=screenSafe});
 bool knownTrial=false;foreach(var button in buttons){string n=button.Current.Name.Replace("&","").Trim();if((n=="Try"||n=="Try Now"||n=="Continue Trial")&&(lower.Contains("free trial")||lower.Contains("trial period")||lower.Contains("continue trial"))){knownTrial=true;candidates.Add(button);}}
 if(cls.ToString()=="#32770"&&!knownTrial){blocked=true;outcome="Stopped on unrecognized owned dialog; no input issued";}
 return true;},IntPtr.Zero);
 // Decide only after inspecting all owned windows, so a refusal cannot be hidden by enumeration order.
 if(!blocked&&!clicked&&candidates.Count==1){var button=candidates[0];object pattern;if(button.Current.IsEnabled&&button.TryGetCurrentPattern(InvokePattern.Pattern,out pattern)){string n=button.Current.Name;inputs.Add(new{elapsedMs=clock.ElapsedMilliseconds,action="UIA.Invoke",verifiedButton=n});Save("inputs.json",inputs);((InvokePattern)pattern).Invoke();clicked=true;outcome="Verified ordinary trial button invoked";}}
 states.Add(new{elapsedMs=clock.ElapsedMilliseconds,hasExited=app.HasExited,exitCode=app.HasExited?(int?)app.ExitCode:null,responding=app.HasExited?(bool?)null:app.Responding,windows=windows});Save("windows.json",states);Save("inputs.json",inputs);
 if(blocked||app.HasExited)break;
 }
 if(!app.HasExited){var mods=new List<object>();try{foreach(ProcessModule m in app.Modules)mods.Add(new{name=m.ModuleName,path=m.FileName,version=m.FileVersionInfo.FileVersion});}catch(Exception e){mods.Add(new{error=e.GetType().Name,hresult=e.HResult});}Save("modules.json",mods);}
 Save("outcome.json",new{outcome=outcome,stroke=false,undo=false,audioRecorded=false,acceptedReferences="0/17",reason="No independently matched native PaintZone anchors; no coordinate input was guessed",windowsVersion="2.2.1.271",macComparison="No Mac feel or timing claim"});return 0;
 }catch(Exception e){var w=e as System.ComponentModel.Win32Exception;Save("observer-error.json",new{error=e.GetType().Name,hresult=e.HResult,nativeError=w==null?0:w.NativeErrorCode});return 2;}
 finally{if(app!=null){bool exited=app.HasExited;int? code=exited?(int?)app.ExitCode:null;if(!exited){app.CloseMainWindow();if(!app.WaitForExit(2000)){var stop=new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"taskkill.exe"),"/PID "+app.Id+" /T /F"){UseShellExecute=false,CreateNoWindow=true};using(var killer=Process.Start(stop))killer.WaitForExit(5000);}app.WaitForExit(5000);}Save("app-exit.json",new{naturalExit=exited,naturalExitCode=code,finalExitCode=app.ExitCode,ownedProcessStopped=app.HasExited});app.Dispose();}}
 }
}
