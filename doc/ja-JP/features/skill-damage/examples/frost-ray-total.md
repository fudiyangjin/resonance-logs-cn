# 寒氷射線 1 回分の合計ダメージ

関連ページ：[スキルダメージ表示](../README.md)

**シナリオ**：フロストメイジの寒氷射線は持続詠唱で、1 回ごとのダメージは小さく、ヒットごとに表示すると画面が埋まってしまいます。詠唱中は加算され続ける数値とヒット数を 1 つだけ表示し、射線が終わったらその回の合計ダメージを見たいとします。

## ステップ 1：スキルグループを作る

1. サイドバーの **{{ui:routes.tools.skillDamage}}** を開き、**{{ui:skillDamage.enabled}}** をオンにします。
2. **{{ui:skillDamage.addGroup}}** をクリックし、**{{ui:skillDamage.groupName}}** に「寒氷射線」と入力します。
3. グループ設定の一番下で「寒氷射線」を検索し、そのダメージを追加します。

## ステップ 2：連続表示にする

1. **{{ui:skillDamage.displayMode}}** を **{{ui:skillDamage.continuousMode}}** にします。
2. **{{ui:skillDamage.windowMode}}** を **{{ui:skillDamage.windowCast}}** にし、**{{ui:skillDamage.windowPreset}}** で **{{ui:skillDamage.castRay}}** を選びます。ウィンドウは自分の詠唱の開始と終了に合わせて開閉し、タイムアウトはありません。
3. **{{ui:skillDamage.castCloseDelay}}** を 0.3 秒程度にします。射線の終了時に最後の数ヒットがまだ届いていないことがあるので、少し待ってから精算します。
4. **{{ui:skillDamage.showComboCount}}** をオンにし、形式は `1 HIT`、位置は **{{ui:skillDamage.comboBottom}}** にします。
5. **{{ui:skillDamage.continuousTotalDuration}}** を 3 秒にします。

## ステップ 3：位置を決める

ページ上部の **{{ui:skillDamage.actions.editLayout}}** をクリックし、このグループのエリアをキャラクターの横へドラッグします。

## 結果

射線の詠唱を始めると加算され続ける数値が表示され、その下にヒット数が出ます。射線が終わると（終了後の待機時間のあと）合計のアニメーションが再生され、合計ダメージが 3 秒間表示されます。

> [!NOTE]
> どのダメージを累計するかは、グループに追加したスキルで決まります。射線中のほかのスキルのダメージも含めたい場合は **{{ui:skillDamage.continuousAll}}** をオンにします。その場合もウィンドウを開始するのは射線だけです。

> [!TIP]
> 持続詠唱プリセットのないスキルには、**{{ui:skillDamage.windowRolling}}**（一定時間新しい命中がなければ精算）か、**{{ui:skillDamage.windowSkills}}**（開始・終了するスキルを指定）を使います。
