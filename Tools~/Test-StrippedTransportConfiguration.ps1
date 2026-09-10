#requires -Version 7.0
param(
    [Parameter(Mandatory = $true)]
    [string]$AssemblyPath
)

# Inspect final player IL without loading Unity code or creating engine objects.
$ErrorActionPreference = 'Stop'
$taskStream = [System.IO.File]::OpenRead((Resolve-Path -LiteralPath $AssemblyPath).Path)
$taskPe = [System.Reflection.PortableExecutable.PEReader]::new($taskStream)
try {
    $taskReader = [System.Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($taskPe)
    $taskMethod = $null
    foreach ($taskHandle in $taskReader.TypeDefinitions) {
        $taskType = $taskReader.GetTypeDefinition($taskHandle)
        if ($taskReader.GetString($taskType.Name) -ne 'WebGlCommandTransport') { continue }
        foreach ($taskMethodHandle in $taskType.GetMethods()) {
            $taskCandidate = $taskReader.GetMethodDefinition($taskMethodHandle)
            if ($taskReader.GetString($taskCandidate.Name) -eq 'CreateConfigurationJson') {
                $taskMethod = $taskCandidate
            }
        }
    }
    if ($null -eq $taskMethod -or $taskMethod.RelativeVirtualAddress -eq 0) {
        throw 'The player assembly has no transport configuration method body.'
    }

    $taskOpCodes = @{}
    foreach ($taskField in [System.Reflection.Emit.OpCodes].GetFields()) {
        if ($taskField.FieldType -eq [System.Reflection.Emit.OpCode]) {
            $taskOp = $taskField.GetValue($null)
            $taskOpCodes[[int]($taskOp.Value -band 0xffff)] = $taskOp
        }
    }
    $taskBody = [System.Reflection.Metadata.PEReaderExtensions]::GetMethodBody(
        $taskPe, $taskMethod.RelativeVirtualAddress)
    $taskBytes = $taskBody.GetILBytes()
    $taskStrings = [System.Collections.Generic.HashSet[string]]::new()
    $taskCalls = [System.Collections.Generic.HashSet[string]]::new()
    $taskPosition = 0
    while ($taskPosition -lt $taskBytes.Length) {
        $taskCode = [int]$taskBytes[$taskPosition++]
        if ($taskCode -eq 0xfe) { $taskCode = 0xfe00 -bor $taskBytes[$taskPosition++] }
        if (-not $taskOpCodes.ContainsKey($taskCode)) { throw 'Unknown player IL opcode.' }
        $taskOp = $taskOpCodes[$taskCode]
        $taskOperandSize = switch ([string]$taskOp.OperandType) {
            'InlineNone' { 0 }
            { $_ -in 'ShortInlineBrTarget', 'ShortInlineI', 'ShortInlineVar' } { 1 }
            'InlineVar' { 2 }
            { $_ -in 'InlineI8', 'InlineR' } { 8 }
            'InlineSwitch' { 4 + 4 * [BitConverter]::ToInt32($taskBytes, $taskPosition) }
            default { 4 }
        }
        if ($taskOp.OperandType -eq [System.Reflection.Emit.OperandType]::InlineString) {
            $taskToken = [BitConverter]::ToInt32($taskBytes, $taskPosition)
            $taskStringHandle = [System.Reflection.Metadata.Ecma335.MetadataTokens]::UserStringHandle(
                $taskToken -band 0x00ffffff)
            [void]$taskStrings.Add($taskReader.GetUserString($taskStringHandle))
        }
        if ($taskOp.OperandType -eq [System.Reflection.Emit.OperandType]::InlineMethod) {
            $taskToken = [BitConverter]::ToInt32($taskBytes, $taskPosition)
            if (($taskToken -band 0xff000000) -eq 0x0a000000) {
                $taskMemberHandle = [System.Reflection.Metadata.Ecma335.MetadataTokens]::MemberReferenceHandle(
                    $taskToken -band 0x00ffffff)
                $taskMember = $taskReader.GetMemberReference($taskMemberHandle)
                [void]$taskCalls.Add($taskReader.GetString($taskMember.Name))
            }
        }
        $taskPosition += $taskOperandSize
    }

    $taskFields = @('transport_id', 'mode', 'allowed_origins', 'target_origin',
        'receiver_object', 'receiver_method', 'maximum_message_characters')
    foreach ($taskName in $taskFields) {
        if (-not $taskStrings.Contains($taskName)) {
            throw "Stripped transport configuration does not directly write wire field '$taskName'."
        }
    }
    foreach ($taskName in @('SerializeObject', 'FromObject', 'ToObject')) {
        if ($taskCalls.Contains($taskName)) {
            throw "Transport configuration still calls reflection-based object mapping '$taskName'."
        }
    }
    if (-not $taskCalls.Contains('set_Item')) {
        throw 'Transport configuration does not contain direct JSON field writes.'
    }
    Write-Output 'PASS: stripped transport configuration directly writes all 7 wire fields without object mapping.'
}
finally {
    $taskPe.Dispose()
    $taskStream.Dispose()
}
