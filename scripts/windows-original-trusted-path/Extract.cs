// Faithful reader for the inspected 312-byte InstallShield 2010 records.
// Codec provenance: ISx, lifenjoiner/ISx 3c4177ddd0519244490ff8e78d380110c8dacdc8.
// Only the MSI is written; the pinned MSI hash validates the decoded stream.
using System;
using System.IO;
using System.IO.Compression;
using System.Text;
class DecodeStream : Stream {
 readonly Stream source; readonly byte[] key; long left; int pos;
 public DecodeStream(Stream s,long n,string name) {source=s;left=n;var b=Encoding.ASCII.GetBytes(name);key=new byte[1024];byte[] salt={19,53,134,7};for(int i=0;i<1024;i++){int j=i%b.Length;key[i]=(byte)(b[j]^salt[j%4]);}}
 public override int Read(byte[] b,int o,int n) {n=(int)Math.Min(n,left);if(n==0)return 0;int k=source.Read(b,o,n);if(k==0)throw new EndOfStreamException();for(int i=o;i<o+k;i++){byte v=b[i];b[i]=(byte)~(((v<<4)|(v>>4))^key[pos]);pos=(pos+1)%1024;}left-=k;return k;}
 public override bool CanRead{get{return true;}} public override bool CanSeek{get{return false;}} public override bool CanWrite{get{return false;}} public override long Length{get{throw new NotSupportedException();}}public override long Position{get{throw new NotSupportedException();}set{throw new NotSupportedException();}} public override void Flush(){}public override long Seek(long o,SeekOrigin w){throw new NotSupportedException();}public override void SetLength(long n){throw new NotSupportedException();}public override void Write(byte[] b,int o,int n){throw new NotSupportedException();}
}
class Extract {
 static int Main(string[] args) {
 try {using(var f=File.OpenRead(args[0]))using(var r=new BinaryReader(f)) {
 f.Position=1379956;byte[] hdr=r.ReadBytes(46);if(Encoding.ASCII.GetString(hdr,0,14)!="InstallShield\0")throw new InvalidDataException();int count=BitConverter.ToUInt16(hdr,14);if(count!=10)throw new InvalidDataException(); bool found=false;
 for(int i=0;i<count;i++){byte[] h=r.ReadBytes(312);if(h.Length!=312)throw new EndOfStreamException();int nul=Array.IndexOf(h,(byte)0,0,260);string name=Encoding.ASCII.GetString(h,0,nul);uint length=BitConverter.ToUInt32(h,268);long end=f.Position+length;if(end>f.Length||BitConverter.ToUInt32(h,260)!=6||BitConverter.ToUInt16(h,280)!=1||Path.GetFileName(name)!=name)throw new InvalidDataException();
 if(name=="Kid Pix 3D.msi") {if(found)throw new InvalidDataException();found=true;using(var d=new DecodeStream(f,length,name)){if(d.ReadByte()!=0x78)throw new InvalidDataException();int flg=d.ReadByte();if(((0x78<<8)+flg)%31!=0||(flg&32)!=0)throw new InvalidDataException();using(var z=new DeflateStream(d,CompressionMode.Decompress))using(var w=new FileStream(args[1],FileMode.CreateNew)){byte[] buf=new byte[1024*1024];long written=0;int n;while((n=z.Read(buf,0,buf.Length))>0){written+=n;if(written>3L*1024*1024*1024)throw new InvalidDataException();w.Write(buf,0,n);}}}}
 f.Position=end;}
 if(!found||f.Position!=f.Length)throw new InvalidDataException();}return 0;
 }catch(Exception e){Console.Error.WriteLine(e.GetType().Name+":"+e.HResult);return 2;}
 }
}
