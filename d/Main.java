package word;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.IOException;
import javax.swing.JFileChooser;
import javax.swing.JLabel;
import grammar.GrammarAnalyzer;
import grammar.GrammarAnalyzer_LR1;
import grammar.GrammarAnalyzer_ε;
import semantics.SemanticAnalyzer_Boolean;

public class Main {

  public static void main(String[] args) {
    // TODO Auto-generated method stub
    
    try {
      JFileChooser filechooser=new JFileChooser();
      filechooser.showDialog(new JLabel(), "选择");    
      File file = filechooser.getSelectedFile();//定义一个file对象，用来初始化FileReader
      FileReader reader;
      reader = new FileReader(file);
      int length = (int) file.length();
      char buf[] = new char[length+1];
      reader.read(buf);
      reader.close();
      WordAnalyzer word=new WordAnalyzer();
      word.analyze(buf);
      new SemanticAnalyzer_Boolean(word.tokens);
      
    } catch (FileNotFoundException e) {
      // TODO Auto-generated catch block
      e.printStackTrace();
    } catch (IOException e) {
      // TODO Auto-generated catch block
      e.printStackTrace();
    }
  }
}
