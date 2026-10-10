param(
  [Parameter(Mandatory = $true)][ValidateSet('status', 'print')][string]$Action,
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [string]$DataFile
)
$ErrorActionPreference = 'Stop'
if ($Action -eq 'status') {
  $printer = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
  if ($null -eq $printer) {
    @{ disponible = $false; nombre = $PrinterName; puerto = $null; driver = $null; motivo = 'NO_ENCONTRADA' } | ConvertTo-Json -Compress
    exit 0
  }
  $disponible = -not $printer.WorkOffline -and $printer.PrinterStatus -notin @('Error', 'Offline')
  @{ disponible = $disponible; nombre = $printer.Name; puerto = $printer.PortName; driver = $printer.DriverName; motivo = $(if ($disponible) { $null } else { 'NO_DISPONIBLE' }) } | ConvertTo-Json -Compress
  exit 0
}
if ([string]::IsNullOrWhiteSpace($DataFile) -or -not (Test-Path -LiteralPath $DataFile -PathType Leaf)) { throw 'DATA_FILE_INVALIDO' }
if (-not ('FastLook.RawPrinter' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
namespace FastLook {
  public static class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOC_INFO_1 { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName = "Fast Look Ticket"; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile = null; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType = "RAW"; }
    [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)] static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOC_INFO_1 di);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr hPrinter, byte[] bytes, int count, out int written);
    public static void Send(string printer, byte[] bytes) {
      IntPtr handle; if (!OpenPrinter(printer, out handle, IntPtr.Zero)) throw new Win32Exception();
      try { if (StartDocPrinter(handle, 1, new DOC_INFO_1()) == 0) throw new Win32Exception(); try { if (!StartPagePrinter(handle)) throw new Win32Exception(); try { int written; if (!WritePrinter(handle, bytes, bytes.Length, out written) || written != bytes.Length) throw new Win32Exception(); } finally { EndPagePrinter(handle); } } finally { EndDocPrinter(handle); } } finally { ClosePrinter(handle); }
    }
  }
}
'@
}
[FastLook.RawPrinter]::Send($PrinterName, [System.IO.File]::ReadAllBytes($DataFile))
