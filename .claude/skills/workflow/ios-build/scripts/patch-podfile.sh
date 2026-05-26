#!/bin/bash
# Applies all required patches to ios/Podfile after expo prebuild.
# Run from the mobile/ directory.

PODFILE="$(git rev-parse --show-toplevel)/mobile/ios/Podfile"

if [ ! -f "$PODFILE" ]; then
  echo "❌ Podfile not found at $PODFILE — run expo prebuild first"
  exit 1
fi

echo "=== Patching ios/Podfile ==="
echo ""

# 1. ExpoFont manual pod (after use_expo_modules!)
if grep -q "pod 'ExpoFont'" "$PODFILE"; then
  echo "✅ ExpoFont pod already present"
else
  sed -i '' "s/  use_expo_modules!/  use_expo_modules!\n  pod 'ExpoFont', :path => '..\/node_modules\/expo-font\/ios'/" "$PODFILE"
  echo "✅ ExpoFont pod added"
fi
echo ""

# 2. Deployment target fallback (15.1 → 16.4)
if grep -q "'16.4'" "$PODFILE"; then
  echo "✅ Deployment target 16.4 already set"
else
  sed -i '' "s/podfile_properties\['ios.deploymentTarget'\] || '15.1'/podfile_properties['ios.deploymentTarget'] || '16.4'/" "$PODFILE"
  echo "✅ Deployment target bumped to 16.4"
fi
echo ""

# 3. fmt + ExpoFont patches in post_install — inject if not present
if grep -q "FMT_CONSTEVAL" "$PODFILE"; then
  echo "✅ fmt Clang 16 patch already present"
else
  # Insert after react_native_post_install block closing paren
  PATCH=$(cat << 'RUBY'

    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 16.4
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.4'
        end
      end
    end

    installer.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |config|
          flags = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
          config.build_settings['OTHER_CPLUSPLUSFLAGS'] = "#{flags} -DFMT_CONSTEVAL=constexpr"
        end
      end
    end

    fmt_base_h = "#{installer.sandbox.root}/fmt/include/fmt/base.h"
    if File.exist?(fmt_base_h)
      content = File.read(fmt_base_h)
      patched = content.gsub(
        /defined\(__apple_build_version__\) && __apple_build_version__ < \d+L/,
        'defined(__apple_build_version__)'
      )
      if patched != content
        File.chmod(0644, fmt_base_h)
        File.write(fmt_base_h, patched)
      end
    end
RUBY
)
  # Insert before the closing `end` of post_install block
  python3 - "$PODFILE" "$PATCH" << 'PYEOF'
import sys
podfile_path = sys.argv[1]
patch = sys.argv[2]
with open(podfile_path, 'r') as f:
    content = f.read()
# Insert patch before the final `end` of post_install block
target = '  end\nend'
replacement = patch + '\n  end\nend'
new_content = content.replace(target, replacement, 1)
with open(podfile_path, 'w') as f:
    f.write(new_content)
print("✅ fmt Clang 16 + deployment target patches applied")
PYEOF
fi
echo ""

# 4. xcodeproj deployment target
XCODEPROJ="$(git rev-parse --show-toplevel)/mobile/ios/Belific.xcodeproj/project.pbxproj"
if [ -f "$XCODEPROJ" ]; then
  if grep -q "IPHONEOS_DEPLOYMENT_TARGET = 15.1" "$XCODEPROJ"; then
    sed -i '' 's/IPHONEOS_DEPLOYMENT_TARGET = 15\.1;/IPHONEOS_DEPLOYMENT_TARGET = 16.4;/g' "$XCODEPROJ"
    echo "✅ xcodeproj deployment target bumped to 16.4"
  else
    echo "✅ xcodeproj deployment target already 16.4+"
  fi
fi

echo ""
echo "=== All Podfile patches applied ==="
