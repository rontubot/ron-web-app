RequestExecutionLevel admin
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var PythonCheckbox
Var PythonInstallFlag

!macro customInit
  StrCpy $PythonInstallFlag 1
!macroend

!macro customInstall
  ${If} $PythonInstallFlag == 1

    ; OJO: con extraFiles, la ruta es $INSTDIR\python-installer
    StrCpy $0 "$INSTDIR\python-installer\python-3.12.2.exe"

    DetailPrint "Buscando instalador de Python en: $0"

    ; Verificar que el archivo exista
    IfFileExists "$0" +3 0
      DetailPrint "ERROR: No se encontró el instalador de Python en $0"
      MessageBox MB_ICONSTOP "No se encontró el instalador de Python en:$\r$\n$0$\r$\nRevisa la sección extraFiles en package.json."
      Goto donePython

    DetailPrint "Ejecutando instalador de Python: $0"
    ExecWait '"$0" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0' $1

    DetailPrint "Python terminó con código: $1"

    ${If} $1 != 0
      MessageBox MB_ICONEXCLAMATION \
        "Python no pudo instalarse automáticamente (código $1).$\r$\n\
Puedes instalarlo manualmente ejecutando:$\r$\n$0"
    ${EndIf}

    donePython:

  ${EndIf}
!macroend

!macro customInstallMode
  nsDialogs::Create 1018
  Pop $0
  ${IfThen} $0 == error ${|} Abort ${|}

  ${NSD_CreateCheckbox} 0 0 100% 12u "Instalar Python 3.12 (recomendado)"
  Pop $PythonCheckbox

  ${If} $PythonInstallFlag == 1
    ${NSD_Check} $PythonCheckbox
  ${Else}
    ${NSD_Uncheck} $PythonCheckbox
  ${EndIf}

  nsDialogs::Show
  ${NSD_GetState} $PythonCheckbox $PythonInstallFlag
!macroend
