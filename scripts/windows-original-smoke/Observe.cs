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
 delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc c,IntPtr p);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out RECT rect);
 [DllImport("user32.dll")]static extern bool SetProcessDPIAware();
 static string output;static Stopwatch clock=Stopwatch.StartNew();static List<object> states=new List<object>();static List<object> inputs=new List<object>();
 static void Save(string name,object data){File.WriteAllText(Path.Combine(output,name),new JavaScriptSerializer{MaxJsonLength=1024*1024}.Serialize(data));}
 [STAThread]static int Main(string[] args){output=args[1];SetProcessDPIAware();Process app=null;string outcome="No visible owned window";bool clicked=false;
 try {var si=new ProcessStartInfo(args[0]){WorkingDirectory=Path.GetDirectoryName(args[0]),UseShellExecute=false};app=Process.Start(si);Save("launch.json",new{pid=app.Id,launchCount=1,elapsedMs=clock.ElapsedMilliseconds});
 // One launch, <=60 seconds of observation, and at most one explicit ordinary trial button.
 for(int frame=0;frame<8;frame++){Thread.Sleep(frame==0?5000:4000);app.Refresh();var windows=new List<object>();bool blocked=false;
 EnumWindows(delegate(IntPtr h,IntPtr ignored){uint pid;GetWindowThreadProcessId(h,out pid);if(pid!=app.Id||!IsWindowVisible(h))return true;RECT r;if(!GetWindowRect(h,out r))return true;
 var names=new List<string>();var buttons=new List<AutomationElement>();string title="";
 try{var root=AutomationElement.FromHandle(h);title=root.Current.Name;var all=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);for(int i=0;i<Math.Min(all.Count,200);i++){var e=all[i];string name=e.Current.Name;if(!String.IsNullOrEmpty(name))names.Add(name.Length>300?name.Substring(0,300):name);if(e.Current.ControlType==ControlType.Button)buttons.Add(e);}}catch(Exception e){names.Add("UIA:"+e.GetType().Name+":"+e.HResult);}
 string joined=title+" "+String.Join(" ",names.ToArray());string lower=joined.ToLowerInvariant();if(lower.Contains("expired")||lower.Contains("elevated")||lower.Contains("activation")||lower.Contains("license key")||lower.Contains("sign in")||lower.Contains("log in")){blocked=true;outcome="Stopped on policy, expiry, activation or login text";}
 string file="window-"+frame+"-"+h.ToInt64().ToString("x")+".png";if(r.r>r.l&&r.b>r.t&&r.r-r.l<=2048&&r.b-r.t<=1536){using(var b=new Bitmap(r.r-r.l,r.b-r.t)){using(var g=Graphics.FromImage(b))g.CopyFromScreen(r.l,r.t,0,0,b.Size);b.Save(Path.Combine(output,file),ImageFormat.Png);}}
 windows.Add(new{handle=h.ToInt64(),title=title,left=r.l,top=r.t,width=r.r-r.l,height=r.b-r.t,controls=names,capture=file});
 if(!blocked&&!clicked){foreach(var button in buttons){string n=button.Current.Name.Replace("&","").Trim();if(n=="Try"||n=="Try Now"||n=="Continue Trial"){object pattern;if(button.Current.IsEnabled&&button.TryGetCurrentPattern(InvokePattern.Pattern,out pattern)){inputs.Add(new{elapsedMs=clock.ElapsedMilliseconds,action="UIA.Invoke",verifiedButton=n});((InvokePattern)pattern).Invoke();clicked=true;outcome="Ordinary verified trial button invoked; subsequent frames retained";break;}}}}
 return true;},IntPtr.Zero);
 states.Add(new{elapsedMs=clock.ElapsedMilliseconds,hasExited=app.HasExited,exitCode=app.HasExited?(int?)app.ExitCode:null,responding=app.HasExited?(bool?)null:app.Responding,windows=windows});Save("windows.json",states);Save("inputs.json",inputs);
 if(blocked||app.HasExited)break;
 }
 if(!app.HasExited){var mods=new List<object>();try{foreach(ProcessModule m in app.Modules)mods.Add(new{name=m.ModuleName,version=m.FileVersionInfo.FileVersion});}catch(Exception e){mods.Add(new{error=e.GetType().Name,hresult=e.HResult});}Save("modules.json",mods);}
 Save("outcome.json",new{outcome=outcome,stroke=false,undo=false,audioRecorded=false,acceptedReferences="0/17",reason="No independently matched native PaintZone anchors; no coordinate input was guessed",windowsVersion="2.2.1.271",macComparison="No Mac feel or timing claim"});return 0;
 }catch(Exception e){var w=e as System.ComponentModel.Win32Exception;Save("observer-error.json",new{error=e.GetType().Name,hresult=e.HResult,nativeError=w==null?0:w.NativeErrorCode});return 2;}
 finally{if(app!=null){bool exited=app.HasExited;int? code=exited?(int?)app.ExitCode:null;if(!exited){app.CloseMainWindow();if(!app.WaitForExit(2000))app.Kill();app.WaitForExit();}Save("app-exit.json",new{naturalExit=exited,naturalExitCode=code,finalExitCode=app.ExitCode,ownedProcessStopped=app.HasExited});}}
 }
}
