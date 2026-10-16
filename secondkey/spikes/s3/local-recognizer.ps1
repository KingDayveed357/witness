# S3 fallback probe: offline transcription of call.wav with Windows' built-in speech recognizer
# (System.Speech dictation). Free and local, no download. Prints JSON with transcript and timing.
Add-Type -AssemblyName System.Speech
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]"en-US")
$rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$rec.SetInputToWaveFile((Join-Path $dir "call.wav"))
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$parts = @()
while ($true) {
  $r = $rec.Recognize()
  if ($null -eq $r) { break }
  $parts += [ordered]@{ text = $r.Text; confidence = [math]::Round($r.Confidence, 3); at_ms = $sw.ElapsedMilliseconds }
}
$sw.Stop()
[ordered]@{ engine = "System.Speech dictation (Windows, offline)"; total_ms = $sw.ElapsedMilliseconds; segments = $parts; transcript = (($parts | ForEach-Object { $_.text }) -join " ") } | ConvertTo-Json -Depth 4
