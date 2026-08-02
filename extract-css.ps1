$lines = Get-Content 'c:\Users\jerry\Desktop\Emerald Cuisine\css\style.css'
Write-Output '--- 2995-3045 (first admin-form-grid input block) ---'
for ($i = 2995; $i -le 3045; $i++) { '{0}:{1}' -f ($i + 1), $lines[$i] }
Write-Output '--- 3165-3225 (second admin-form-grid input block + focus) ---'
for ($i = 3165; $i -le 3225; $i++) { '{0}:{1}' -f ($i + 1), $lines[$i] }
